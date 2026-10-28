import { validateWorkflowV2 } from "./src/v2.js";

const rulesString = "something";
const candidate = {
  workflow_version: "2.0",
  name: "Order Exception Autoworker",
  description: "Handle routine e-commerce order exceptions",
  status: "DRAFT",
  variables: [
    { name: "var_0", type: "string", required: true },
    { name: "var_1", type: "string", required: true }
  ],
  secrets: [],
  expected_domains: ["http://localhost:4000"],
  root_step: {
    id: "step_root",
    operation: "SEQUENCE",
    target: "DATA",
    description: "Root execution sequence",
    children: [
      {
        id: "step_extract_status",
        operation: "EXTRACT",
        target: "BROWSER_SEMANTIC",
        description: "Extract order status",
        args: { instruction: "Extract the order status" },
        bind_result_to: "var_0"
      },
      {
        id: "step_extract_days",
        operation: "EXTRACT",
        target: "BROWSER_SEMANTIC",
        description: "Extract days delayed",
        args: { instruction: "Extract the number of days delayed" },
        bind_result_to: "var_1"
      },
      {
        id: "step_if_processing",
        operation: "IF",
        target: "DATA",
        description: "Check if PROCESSING",
        args: { condition: "EQUALS", left: "{{var_0}}", right: "PROCESSING" },
        children: [
          {
            id: "step_processing_true",
            operation: "SEQUENCE",
            target: "DATA",
            description: "Processing true branch",
            args: {},
            children: rulesString.includes("already processed") ? [] : [
              {
                id: "step_click_mark_checked",
                operation: "CLICK",
                target: "BROWSER_SEMANTIC",
                description: "Click Mark Checked",
                args: { instruction: "Click Mark Checked" }
              }
            ]
          },
          {
            id: "step_processing_false",
            operation: "SEQUENCE",
            target: "DATA",
            description: "Processing false branch",
            args: {},
            children: [
              {
                id: "step_if_delayed",
                operation: "IF",
                target: "DATA",
                description: "Check if DELAYED",
                args: { condition: "EQUALS", left: "{{var_0}}", right: "DELAYED" },
                children: [
                  {
                    id: "step_delayed_true",
                    operation: "SEQUENCE",
                    target: "DATA",
                    description: "Delayed true branch",
                    args: {},
                    children: [
                      {
                        id: "step_if_days",
                        operation: "IF",
                        target: "DATA",
                        description: "Check days delayed <= 7",
                        args: { condition: "LESS_THAN_EQUALS", left: "{{var_1}}", right: 7 },
                        children: [
                          {
                            id: "step_days_true",
                            operation: "SEQUENCE",
                            target: "DATA",
                            description: "Days <= 7",
                            args: {},
                            children: [
                              {
                                id: "step_click_notify",
                                operation: "CLICK",
                                target: "BROWSER_SEMANTIC",
                                description: "Click Notify Operator",
                                args: { selector: "button#notify-operator" }
                              }
                            ]
                          },
                          {
                            id: "step_days_false",
                            operation: "SEQUENCE",
                            target: "DATA",
                            description: "Days > 7",
                            args: {},
                            children: [
                              {
                                id: "step_click_escalate",
                                operation: "CLICK",
                                target: "BROWSER_SEMANTIC",
                                description: "Click Escalate",
                                args: { selector: "button#escalate" }
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  },
                  {
                    id: "step_delayed_false",
                    operation: "SEQUENCE",
                    target: "DATA",
                    description: "Delayed false branch (ambiguous)",
                    args: {},
                    children: [
                      {
                        id: "step_click_human",
                        operation: "CLICK",
                        target: "BROWSER_SEMANTIC",
                        description: "Request human help",
                        args: { selector: "button#request-human-help" }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  compiler: {
    version: "1.0",
    source_specification_id: "spec-123",
    compiled_at: new Date().toISOString()
  }
};

try {
  validateWorkflowV2(candidate);
  console.log("Validation successful");
} catch (e) {
  console.error(JSON.stringify(e.issues || e.message, null, 2));
}
