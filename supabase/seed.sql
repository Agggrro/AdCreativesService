-- ============================================================================
-- AdInteract — seed data (templates catalog)
-- ----------------------------------------------------------------------------
-- runtime_keys point at asset paths inside the `creatives` Storage bucket; build
-- the units with `npm run build:runtime` and upload runtime/dist/** to those
-- paths (see runtime/README.md). Idempotent via fixed ids.
-- ============================================================================

insert into public.templates (
  id, name, description, type, category,
  supported_standards, runtime_keys, config_schema, pricing_tier, is_published
) values
  (
    '00000000-0000-4000-8000-000000000001',
    'Shoppable Video',
    'Video ad with a Shop Now overlay that drives clicks to your product.',
    'shoppable_video',
    'commerce',
    array['simid', 'vpaid'],
    '{"simid":"shoppable/simid/index.html","vpaid":"shoppable/vpaid/unit.js"}'::jsonb,
    '{"fields":[
       {"name":"videoUrl","label":"Video URL","type":"url","required":true},
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url"},
       {"name":"productName","label":"Product name","type":"text"},
       {"name":"productImageUrl","label":"Product image URL","type":"image"},
       {"name":"durationSeconds","label":"Duration (s)","type":"number"}
     ]}'::jsonb,
    'standard',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'Scratch & Reveal',
    'A cover the viewer rubs away to reveal the image; at a threshold a CTA drives the click.',
    'scratch_reveal',
    'interactive',
    array['vpaid'],
    '{"vpaid":"scratch-reveal/vpaid.js"}'::jsonb,
    '{"fields":[
       {"name":"imageUrl","label":"Reveal image URL","type":"image","required":true},
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url","required":true},
       {"name":"coverText","label":"Cover text","type":"text","default":"Scratch to reveal"},
       {"name":"coverColor","label":"Cover color (hex)","type":"text","default":"#3a3a3a"},
       {"name":"revealThreshold","label":"Reveal threshold (%)","type":"range","min":10,"max":90,"default":40},
       {"name":"ctaText","label":"Button text","type":"text","default":"Watch full video"},
       {"name":"durationSeconds","label":"Duration (s)","type":"number","default":15}
     ]}'::jsonb,
    'standard',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'Before / After Slider',
    'Two same-framed images with a draggable divider; the viewer reveals the second image, then a CTA.',
    'slider',
    'interactive',
    array['vpaid'],
    '{"vpaid":"slider/vpaid.js"}'::jsonb,
    '{"fields":[
       {"name":"imageBeforeUrl","label":"Before image URL","type":"image","required":true},
       {"name":"imageAfterUrl","label":"After image URL","type":"image","required":true},
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url","required":true},
       {"name":"startPercent","label":"Start position (%)","type":"range","min":0,"max":100,"default":50},
       {"name":"ctaText","label":"Button text","type":"text","default":"See more"},
       {"name":"durationSeconds","label":"Duration (s)","type":"number","default":15}
     ]}'::jsonb,
    'standard',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'Quick Setup Quiz',
    'A question with 2-4 image options; the pick leads to an honest results CTA.',
    'quiz',
    'interactive',
    array['vpaid'],
    '{"vpaid":"quiz/vpaid.js"}'::jsonb,
    '{"fields":[
       {"name":"questionText","label":"Question","type":"text","required":true,"default":"What are you into?"},
       {"name":"option1Label","label":"Option 1 label","type":"text","required":true},
       {"name":"option1ImageUrl","label":"Option 1 image URL","type":"image"},
       {"name":"option2Label","label":"Option 2 label","type":"text","required":true},
       {"name":"option2ImageUrl","label":"Option 2 image URL","type":"image"},
       {"name":"option3Label","label":"Option 3 label","type":"text"},
       {"name":"option3ImageUrl","label":"Option 3 image URL","type":"image"},
       {"name":"option4Label","label":"Option 4 label","type":"text"},
       {"name":"option4ImageUrl","label":"Option 4 image URL","type":"image"},
       {"name":"resultText","label":"Result heading","type":"text","default":"See your matches"},
       {"name":"ctaText","label":"Button text","type":"text","default":"Continue"},
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url","required":true},
       {"name":"durationSeconds","label":"Duration (s)","type":"number","default":15}
     ]}'::jsonb,
    'standard',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'Age / Content Gate',
    'A genuine 18+ confirmation over a blurred background; confirm drives the click.',
    'age_gate',
    'interactive',
    array['vpaid'],
    '{"vpaid":"age-gate/vpaid.js"}'::jsonb,
    '{"fields":[
       {"name":"backgroundImageUrl","label":"Background image URL","type":"image","required":true},
       {"name":"headline","label":"Headline","type":"text","default":"This content is 18+"},
       {"name":"subtext","label":"Subtext","type":"text"},
       {"name":"confirmText","label":"Confirm button","type":"text","default":"I am 18 or older"},
       {"name":"denyText","label":"Deny button","type":"text","default":"Leave"},
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url","required":true},
       {"name":"durationSeconds","label":"Duration (s)","type":"number","default":15}
     ]}'::jsonb,
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
