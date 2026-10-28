-- Add execution_checkpoints table
CREATE TABLE execution_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
    workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    cursor_json JSONB NOT NULL DEFAULT 'null'::jsonb,
    runtime_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    control_flow_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    side_effect_state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE execution_checkpoints ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY "execution_checkpoints_tenant_isolation" ON execution_checkpoints
    FOR ALL
    USING (tenant_id = (SELECT tenant_id FROM organization_members WHERE auth.uid() = user_id LIMIT 1));
