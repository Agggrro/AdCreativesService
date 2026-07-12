-- ============================================================================
-- AdInteract — seed data
-- ----------------------------------------------------------------------------
-- One published "Shoppable Video" template (SIMID + VPAID). runtime_keys point
-- at the asset paths inside the `creatives` Storage bucket; upload the files in
-- runtime/shoppable/** to those paths (see runtime/README.md).
-- Idempotent via a fixed id.
-- ============================================================================

insert into public.templates (
  id, name, description, type, category,
  supported_standards, runtime_keys, config_schema, pricing_tier, is_published
) values (
  '00000000-0000-4000-8000-000000000001',
  'Shoppable Video',
  'Video ad with a Shop Now overlay that drives clicks to your product.',
  'shoppable_video',
  'commerce',
  array['simid', 'vpaid'],
  '{"simid":"shoppable/simid/index.html","vpaid":"shoppable/vpaid/unit.js"}'::jsonb,
  '{
     "fields": [
       {"name": "videoUrl", "label": "Video URL", "type": "url", "required": true},
       {"name": "clickThroughUrl", "label": "Click-through URL", "type": "url"},
       {"name": "productName", "label": "Product name", "type": "text"},
       {"name": "productImageUrl", "label": "Product image URL", "type": "url"},
       {"name": "durationSeconds", "label": "Duration (s)", "type": "number"}
     ]
   }'::jsonb,
  'standard',
  true
)
on conflict (id) do update set
  name                = excluded.name,
  description         = excluded.description,
  type                = excluded.type,
  category            = excluded.category,
  supported_standards = excluded.supported_standards,
  runtime_keys        = excluded.runtime_keys,
  config_schema       = excluded.config_schema,
  pricing_tier        = excluded.pricing_tier,
  is_published        = excluded.is_published;

-- Scratch & Reveal (interactive-image, VPAID-first) — ADR-0005
insert into public.templates (
  id, name, description, type, category,
  supported_standards, runtime_keys, config_schema, pricing_tier, is_published
) values (
  '00000000-0000-4000-8000-000000000002',
  'Scratch & Reveal',
  'A cover the viewer rubs away to reveal the image; at a threshold a CTA drives the click.',
  'scratch_reveal',
  'interactive',
  array['vpaid'],
  '{"vpaid":"scratch-reveal/vpaid.js"}'::jsonb,
  '{
     "fields": [
       {"name": "imageUrl", "label": "Reveal image URL", "type": "image", "required": true, "placeholder": "https://cdn.example.com/image.jpg"},
       {"name": "clickThroughUrl", "label": "Click-through URL", "type": "url", "required": true, "placeholder": "https://offer.example.com"},
       {"name": "coverText", "label": "Cover text", "type": "text", "default": "Scratch to reveal"},
       {"name": "coverColor", "label": "Cover color (hex)", "type": "text", "default": "#3a3a3a"},
       {"name": "revealThreshold", "label": "Reveal threshold (%)", "type": "range", "min": 10, "max": 90, "default": 40},
       {"name": "ctaText", "label": "Button text", "type": "text", "default": "Watch full video"},
       {"name": "durationSeconds", "label": "Duration (s)", "type": "number", "default": 15}
     ]
   }'::jsonb,
  'standard',
  true
)
on conflict (id) do update set
  name                = excluded.name,
  description         = excluded.description,
  type                = excluded.type,
  category            = excluded.category,
  supported_standards = excluded.supported_standards,
  runtime_keys        = excluded.runtime_keys,
  config_schema       = excluded.config_schema,
  pricing_tier        = excluded.pricing_tier,
  is_published        = excluded.is_published;
