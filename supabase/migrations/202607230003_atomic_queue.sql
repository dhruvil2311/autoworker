-- Migration: Phase B - Atomic Background Task Claiming
-- Purpose: Safely claim background tasks using SKIP LOCKED to prevent concurrent worker races

CREATE OR REPLACE FUNCTION claim_background_task(claim_limit integer)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  type text,
  payload jsonb,
  status text,
  retry_count integer,
  scheduled_for timestamptz
) AS $$
DECLARE
  claimed_ids uuid[];
BEGIN
  RETURN QUERY
  -- 1. Select and lock eligible tasks
  WITH locked_tasks AS (
    SELECT t.id
    FROM background_tasks t
    WHERE t.status = 'PENDING'
      AND t.scheduled_for <= now()
    ORDER BY t.scheduled_for ASC
    FOR UPDATE SKIP LOCKED
    LIMIT claim_limit
  )
  -- 2. Update their status to processing
  UPDATE background_tasks t
  SET status = 'PROCESSING',
      updated_at = now()
  FROM locked_tasks
  WHERE t.id = locked_tasks.id
  RETURNING 
    t.id, 
    t.tenant_id, 
    t.type, 
    t.payload, 
    t.status, 
    t.retry_count, 
    t.scheduled_for;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Ensure the function is executable by the authenticated and service roles
GRANT EXECUTE ON FUNCTION claim_background_task(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_background_task(integer) TO service_role;
