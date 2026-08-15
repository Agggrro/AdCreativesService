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
    '{"groups":[
       {"id":"viewability"}
     ],"fields":[
       {"name":"videoUrl","label":"Video URL","type":"image","required":true},
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url"},
       {"name":"productName","label":"Product name","type":"text"},
       {"name":"productImageUrl","label":"Product image URL","type":"image"},
       {"name":"verificationVendor","label":"Verification vendor","type":"text","group":"viewability","help":"Your OMID verification vendor''s name/key (e.g. as given in their integration docs). SIMID only — pass-through, we are not the vendor.","showWhen":[{"field":"selected_format","equals":["simid"]}]},
       {"name":"verificationScriptUrl","label":"Verification script URL","type":"url","group":"viewability","help":"The vendor''s OMID JavaScriptResource URL (https only).","showWhen":[{"field":"selected_format","equals":["simid"]}]},
       {"name":"verificationParameters","label":"Verification parameters","type":"textarea","group":"viewability","help":"Opaque string the vendor gave you, passed through unchanged as VerificationParameters.","showWhen":[{"field":"selected_format","equals":["simid"]}]}
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
       {"name":"ctaText","label":"Button text","type":"text","default":"Watch full video"}
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
       {"name":"ctaText","label":"Button text","type":"text","default":"See more"}
     ]}'::jsonb,
    'standard',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'Quick Setup Quiz',
    'One to three A/B questions with image options; one shared result, or a different result for every answer path.',
    'quiz',
    'interactive',
    array['vpaid'],
    '{"vpaid":"quiz/vpaid.js"}'::jsonb,
    '{"groups":[
       {"id":"quizFlow"},
       {"id":"quizStep1"},
       {"id":"quizStep2"},
       {"id":"quizStep3"},
       {"id":"quizResult"},
       {"id":"quizOutcomes","kind":"matrix"},
       {"id":"quizTag"}
     ],"fields":[
       {"name":"stepCount","label":"Number of questions","type":"select","required":true,"default":"1","group":"quizFlow","options":[{"value":"1","label":"1 question"},{"value":"2","label":"2 questions"},{"value":"3","label":"3 questions"}]},
       {"name":"questionText","label":"Question 1","type":"text","required":true,"default":"What are you into?","group":"quizStep1"},
       {"name":"option1Label","label":"Option A label","type":"text","required":true,"default":"Option A","group":"quizStep1"},
       {"name":"option1ImageUrl","label":"Option A image","type":"image","group":"quizStep1"},
       {"name":"option2Label","label":"Option B label","type":"text","required":true,"default":"Option B","group":"quizStep1"},
       {"name":"option2ImageUrl","label":"Option B image","type":"image","group":"quizStep1"},
       {"name":"step2QuestionText","label":"Question 2","type":"text","required":true,"default":"And which of these?","group":"quizStep2","showWhen":[{"field":"stepCount","equals":["2","3"]}]},
       {"name":"step2Option1Label","label":"Option A label","type":"text","required":true,"default":"Option A","group":"quizStep2","showWhen":[{"field":"stepCount","equals":["2","3"]}]},
       {"name":"step2Option1ImageUrl","label":"Option A image","type":"image","group":"quizStep2","showWhen":[{"field":"stepCount","equals":["2","3"]}]},
       {"name":"step2Option2Label","label":"Option B label","type":"text","required":true,"default":"Option B","group":"quizStep2","showWhen":[{"field":"stepCount","equals":["2","3"]}]},
       {"name":"step2Option2ImageUrl","label":"Option B image","type":"image","group":"quizStep2","showWhen":[{"field":"stepCount","equals":["2","3"]}]},
       {"name":"step3QuestionText","label":"Question 3","type":"text","required":true,"default":"Last one: pick one","group":"quizStep3","showWhen":[{"field":"stepCount","equals":["3"]}]},
       {"name":"step3Option1Label","label":"Option A label","type":"text","required":true,"default":"Option A","group":"quizStep3","showWhen":[{"field":"stepCount","equals":["3"]}]},
       {"name":"step3Option1ImageUrl","label":"Option A image","type":"image","group":"quizStep3","showWhen":[{"field":"stepCount","equals":["3"]}]},
       {"name":"step3Option2Label","label":"Option B label","type":"text","required":true,"default":"Option B","group":"quizStep3","showWhen":[{"field":"stepCount","equals":["3"]}]},
       {"name":"step3Option2ImageUrl","label":"Option B image","type":"image","group":"quizStep3","showWhen":[{"field":"stepCount","equals":["3"]}]},
       {"name":"resultMode","label":"Result screen","type":"select","required":true,"default":"universal","group":"quizResult","options":[{"value":"universal","label":"One result for every answer"},{"value":"branching","label":"A different result per answer path"}]},
       {"name":"resultText","label":"Result heading","type":"text","default":"See your matches","group":"quizResult","showWhen":[{"field":"resultMode","equals":["universal"]}]},
       {"name":"ctaText","label":"Result button text","type":"text","default":"Continue","group":"quizResult","showWhen":[{"field":"resultMode","equals":["universal"]}]},
       {"name":"resultAHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"A","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["1"]}]},
       {"name":"resultACtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"A","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["1"]}]},
       {"name":"resultAUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"A","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["1"]}]},
       {"name":"resultBHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"B","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["1"]}]},
       {"name":"resultBCtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"B","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["1"]}]},
       {"name":"resultBUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"B","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["1"]}]},
       {"name":"resultAAHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"AA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultAACtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"AA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultAAUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"AA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultABHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"AB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultABCtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"AB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultABUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"AB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultBAHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"BA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultBACtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"BA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultBAUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"BA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultBBHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"BB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultBBCtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"BB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultBBUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"BB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["2"]}]},
       {"name":"resultAAAHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"AAA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultAAACtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"AAA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultAAAUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"AAA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultAABHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"AAB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultAABCtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"AAB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultAABUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"AAB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultABAHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"ABA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultABACtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"ABA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultABAUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"ABA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultABBHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"ABB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultABBCtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"ABB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultABBUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"ABB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBAAHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"BAA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBAACtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"BAA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBAAUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"BAA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBABHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"BAB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBABCtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"BAB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBABUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"BAB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBBAHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"BBA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBBACtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"BBA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBBAUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"BBA","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBBBHeading","label":"Heading","type":"text","required":true,"group":"quizOutcomes","block":"BBB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBBBCtaText","label":"Button text","type":"text","required":true,"group":"quizOutcomes","block":"BBB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"resultBBBUrl","label":"Click-through URL","type":"url","required":true,"group":"quizOutcomes","block":"BBB","showWhen":[{"field":"resultMode","equals":["branching"]},{"field":"stepCount","equals":["3"]}]},
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url","required":true,"group":"quizTag","help":"The destination in the VAST tag itself. The players own click control uses it, and so does any player that ignores the per-path URL."}
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
       {"name":"clickThroughUrl","label":"Click-through URL","type":"url","required":true}
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
