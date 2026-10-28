"""Comprehensive automated test suite for Desktop Evidence Intelligence Engine."""

import os
import shutil
import tempfile
import unittest

from ghost_evidence.pipeline import DesktopEvidencePipeline
from ghost_evidence.tests.synthetic_data import (
    generate_synthetic_cross_app_video,
    generate_synthetic_screenshot,
)
from ghost_evidence.ocr.spatial import analyze_spatial_relationships
from ghost_evidence.ocr.base import OCRTextItem
from ghost_evidence.models.ui_element import BoundingBox
from ghost_evidence.semantic.generalization import generalize_demonstrated_value


class TestDesktopEvidenceIntelligence(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.test_dir = tempfile.mkdtemp(prefix="ghost_evidence_test_")
        cls.video_path = os.path.join(cls.test_dir, "synthetic_task.mp4")
        generate_synthetic_cross_app_video(cls.video_path, fps=10.0)

        cls.excel_shot_path = os.path.join(cls.test_dir, "excel_shot.png")
        generate_synthetic_screenshot(cls.excel_shot_path, "Excel")

        cls.erp_shot_path = os.path.join(cls.test_dir, "erp_shot.png")
        generate_synthetic_screenshot(cls.erp_shot_path, "ERP")

    @classmethod
    def tearDownClass(cls):
        if os.path.exists(cls.test_dir):
            shutil.rmtree(cls.test_dir, ignore_errors=True)

    def test_01_media_validation_and_metadata(self):
        """Test video validation and metadata extraction."""
        pipeline = DesktopEvidencePipeline()
        output_dir = os.path.join(self.test_dir, "out_01")
        result = pipeline.process_media(self.video_path, output_dir=output_dir)

        self.assertEqual(result["status"], "COMPLETED")
        meta = result["metadata"]
        self.assertGreater(meta["duration_seconds"], 0)
        self.assertEqual(meta["width"], 800)
        self.assertEqual(meta["height"], 600)
        self.assertGreater(meta["frame_count"], 50)

    def test_02_spatial_ocr_label_value_relation(self):
        """Test that spatial relationships correctly link labels with adjacent values."""
        items = [
            OCRTextItem(
                id="item_lbl",
                text="Invoice Amount:",
                bounding_box=BoundingBox(x=50, y=180, width=150, height=25),
                confidence=0.98,
            ),
            OCRTextItem(
                id="item_val",
                text="5000",
                bounding_box=BoundingBox(x=230, y=180, width=100, height=25),
                confidence=0.95,
            ),
        ]
        rels = analyze_spatial_relationships(items)
        self.assertGreater(len(rels), 0)
        lbl_val_rel = next((r for r in rels if r.relation_type == "LABEL_VALUE"), None)
        self.assertIsNotNone(lbl_val_rel)
        self.assertEqual(lbl_val_rel.inferred_label, "Invoice Amount")
        self.assertEqual(lbl_val_rel.inferred_value, "5000")

    def test_03_application_switching_detection(self):
        """Test detection of transitions across Excel, ERP, and Browser."""
        pipeline = DesktopEvidencePipeline()
        output_dir = os.path.join(self.test_dir, "out_03")
        result = pipeline.process_media(self.video_path, output_dir=output_dir)

        detected_apps = result["timeline"]["applications_detected"]
        self.assertTrue(len(detected_apps) >= 2)
        # Should detect Excel and ERP/Tally or Browser
        self.assertTrue(any(app in ["Excel", "Tally", "Browser"] for app in detected_apps))

    def test_04_cross_app_action_reconstruction(self):
        """Test full cross-app action reconstruction."""
        pipeline = DesktopEvidencePipeline()
        output_dir = os.path.join(self.test_dir, "out_04")
        result = pipeline.process_media(self.video_path, output_dir=output_dir)

        actions = result["semantic_actions"]
        self.assertGreater(len(actions), 0)

        # Verify every action has full provenance
        for act in actions:
            prov = act["provenance"]
            self.assertIsNotNone(prov["source_media_id"])
            self.assertGreaterEqual(prov["end_timestamp"], prov["start_timestamp"])
            self.assertGreater(len(prov["frame_ids"]), 0)

    def test_05_generalization_of_variables(self):
        """Test that demonstrated values are generalized into dynamic variables."""
        is_var, name, v_type = generalize_demonstrated_value("5000", field_label="Invoice Amount")
        self.assertTrue(is_var)
        self.assertEqual(v_type, "number")

        is_var2, name2, v_type2 = generalize_demonstrated_value("Acme Corp", field_label="Party Account Name")
        self.assertTrue(is_var2)
        self.assertIn("name", name2)

    def test_06_independent_screenshot_ingestion(self):
        """Test screenshot ingestion."""
        pipeline = DesktopEvidencePipeline()
        output_dir = os.path.join(self.test_dir, "out_06")
        result = pipeline.process_media(self.excel_shot_path, output_dir=output_dir)

        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(len(result["frames"]), 1)
        self.assertEqual(result["frames"][0]["timestamp_seconds"], 0.0)

    def test_07_no_hallucinated_clicks(self):
        """Verify that when pointer is stationary or absent, clicks are not invented."""
        pipeline = DesktopEvidencePipeline()
        output_dir = os.path.join(self.test_dir, "out_07")
        # Run on a static screenshot
        result = pipeline.process_media(self.erp_shot_path, output_dir=output_dir)
        timeline = result["timeline"]
        click_events = [e for e in timeline["events"] if e["event_name"] == "LEFT_CLICK"]
        # Stationary single frame must not invent left clicks
        self.assertEqual(len(click_events), 0)

    def test_08_loop_detection(self):
        """Test loop detection across repeating sequences of actions."""
        from ghost_evidence.models.semantic import SemanticEvent, SemanticActionType
        from ghost_evidence.models.provenance import EvidenceProvenance
        from ghost_evidence.semantic.process_understanding import ProcessUnderstandingEngine

        engine = ProcessUnderstandingEngine()
        prov = EvidenceProvenance(source_media_id="test", start_timestamp=0, end_timestamp=1)
        actions = [
            SemanticEvent(id="1", action_type=SemanticActionType.READ_DATA, application="Excel", target_description="Row 1", summary="Read 1", start_timestamp=0, end_timestamp=1, provenance=prov),
            SemanticEvent(id="2", action_type=SemanticActionType.ENTER_VALUE, application="ERP", target_description="Amt 1", summary="Enter 1", start_timestamp=1, end_timestamp=2, provenance=prov),
            SemanticEvent(id="3", action_type=SemanticActionType.READ_DATA, application="Excel", target_description="Row 2", summary="Read 2", start_timestamp=2, end_timestamp=3, provenance=prov),
            SemanticEvent(id="4", action_type=SemanticActionType.ENTER_VALUE, application="ERP", target_description="Amt 2", summary="Enter 2", start_timestamp=3, end_timestamp=4, provenance=prov),
        ]
        loops = engine._detect_loops(actions)
        self.assertGreater(len(loops), 0)
        self.assertEqual(loops[0]["pattern_length"], 2)

    def test_09_dialog_popup_conditional_detection(self):
        """Test conditional branch detection from modal dialogs."""
        from ghost_evidence.models.timeline import DesktopState
        from ghost_evidence.semantic.process_understanding import ProcessUnderstandingEngine

        engine = ProcessUnderstandingEngine()
        states = [
            DesktopState(
                timestamp=1.5,
                frame_id="f1",
                active_application="ERP",
                active_window_title="Confirm Post",
                active_dialog="Save voucher confirmation?",
                visible_elements=[],
                visible_texts=["Do you want to save this voucher?"],
            )
        ]
        conditionals = engine._detect_conditionals([], states)
        self.assertGreater(len(conditionals), 0)
        self.assertIn("Save voucher confirmation", conditionals[0]["condition"])

    def test_10_ambiguity_uncertainty_creation(self):
        """Test that low-confidence actions produce UncertaintyRecords without hallucinating."""
        from ghost_evidence.semantic.ambiguity import AmbiguityEngine

        engine = AmbiguityEngine()
        unc = engine.evaluate_action_ambiguity(
            action_name="Save",
            confidence=0.65,  # Low confidence
            timestamp=12.4,
            application="Tally",
            evidence_frames=["frame_000100"],
            context_reason="Blurry button text",
        )
        self.assertIsNotNone(unc)
        self.assertEqual(unc.uncertainty_type, "LOW_CONFIDENCE_ACTION")
        self.assertIn("save", unc.clarification_question.lower())

    def test_11_contradiction_detection(self):
        """Test detection of conflicting evidence across demonstrations."""
        from ghost_evidence.semantic.ambiguity import AmbiguityEngine

        engine = AmbiguityEngine()
        observations = [
            {"intent": "SAVE_INVOICE", "application": "Excel", "frame_id": "f1", "timestamp": 1.0},
            {"intent": "SAVE_INVOICE", "application": "Tally", "frame_id": "f2", "timestamp": 2.0},
        ]
        contradictions = engine.detect_contradictions(observations)
        self.assertGreater(len(contradictions), 0)
        self.assertIn("SAVE_INVOICE", contradictions[0].description)

    def test_12_verification_generation(self):
        """Test generation of state-based post-condition verification."""
        from ghost_evidence.models.semantic import SemanticEvent, SemanticActionType
        from ghost_evidence.models.provenance import EvidenceProvenance
        from ghost_evidence.semantic.process_understanding import ProcessUnderstandingEngine

        engine = ProcessUnderstandingEngine()
        prov = EvidenceProvenance(source_media_id="test", start_timestamp=0, end_timestamp=1)
        save_act = SemanticEvent(
            id="s1",
            action_type=SemanticActionType.SAVE_TRANSACTION,
            application="ERP",
            target_description="Save",
            summary="Save invoice",
            start_timestamp=5.0,
            end_timestamp=5.5,
            provenance=prov,
        )
        verification = engine._generate_verification(save_act)
        self.assertEqual(verification["type"], "text_contains")
        self.assertEqual(verification["expectedValue"], "Success")

    def test_13_tri_state_keyboard_inference(self):
        """Test tri-state keyboard analysis: OBSERVED, INFERRED, UNKNOWN."""
        from ghost_evidence.keyboard.analyzer import KeyboardAnalyzer
        from ghost_evidence.ocr.base import OCRTextItem
        from ghost_evidence.models.ui_element import BoundingBox
        from ghost_evidence.models.observation import InferenceStatus

        analyzer = KeyboardAnalyzer()
        prev_items = [
            OCRTextItem(id="f1", text="", bounding_box=BoundingBox(x=100, y=100, width=120, height=25))
        ]
        curr_items = [
            OCRTextItem(id="f1_new", text="INV-2026-99", bounding_box=BoundingBox(x=100, y=100, width=120, height=25), confidence=0.92)
        ]
        events = analyzer.analyze_field_mutations(prev_items, curr_items, timestamp=2.0, frame_id="frame_000020")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].text, "INV-2026-99")
        self.assertEqual(events[0].inference_status, InferenceStatus.INFERRED)

    def test_14_missing_or_corrupt_evidence_handling(self):
        """Test graceful error handling for missing or corrupt files."""
        pipeline = DesktopEvidencePipeline()
        with self.assertRaises(ValueError):
            pipeline.process_media("non_existent_file_path.mp4", output_dir=self.test_dir)

    def test_15_provenance_traceability(self):
        """Verify that user can inspect 'Why does Ghost think this step exists?' and see exact frame provenance."""
        pipeline = DesktopEvidencePipeline()
        output_dir = os.path.join(self.test_dir, "out_15")
        result = pipeline.process_media(self.video_path, output_dir=output_dir)

        actions = result["semantic_actions"]
        self.assertTrue(len(actions) > 0)
        for act in actions:
            self.assertIn("provenance", act)
            prov = act["provenance"]
            self.assertIn("rationale", prov)
            self.assertGreater(len(prov["frame_ids"]), 0)


if __name__ == "__main__":
    unittest.main()

