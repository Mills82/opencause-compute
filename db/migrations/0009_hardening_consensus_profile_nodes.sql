WITH ranked_active_links AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY node_id ORDER BY attached_at DESC, id DESC) AS rn
  FROM volunteer_profile_nodes
  WHERE detached_at IS NULL
)
UPDATE volunteer_profile_nodes
SET detached_at = NOW()
WHERE id IN (SELECT id FROM ranked_active_links WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS volunteer_profile_nodes_one_active_node_idx
ON volunteer_profile_nodes(node_id)
WHERE detached_at IS NULL;
