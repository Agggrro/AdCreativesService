import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_ACCEPT,
  MEDIA_KEY_RE,
  buildMediaObjectPath,
  isAllowedMediaMime,
  isOwnMediaUrl,
  mediaExtension,
  mediaHost,
  ownMediaRefs,
  parseOwnMediaUrl,
  r2MediaUrl,
} from "./creative-media.ts";

/**
 * Run with `npm run test:media`.
 *
 * Pins what counts as one of our media objects (ADR-0010, ADR-0028). For R2
 * this is most of the delete guard — there is no RLS behind it — so a URL that
 * `ownMediaRefs` returns is one `deleteCreative` will remove with the server's
 * key, and one `npm run media:migrate` will move.
 */

const SUPABASE = "https://ref.supabase.co";
const MEDIA = "https://media.smithcdn.net";
const STORAGE = `${SUPABASE}/storage/v1/object/public/creative-media`;
const ME = "7c246c1c-4555-4787-b8f8-a21a39dd2711";
const YOU = "0f8f6045-0411-4fdb-8b94-90e727d4ccea";
const FILE = "b5401216-38cd-48db-b634-5eeb9c9af52d";
const FILE2 = "c5bacef2-cc73-42ea-88fd-d26907bfbe49";

/** Set `env` for the duration of `fn`, then put back exactly the keys it touched. */
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const apply = (values: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(env);
  try {
    fn();
  } finally {
    apply(saved);
  }
}

const both = { NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_MEDIA_URL: MEDIA };

test("an R2 URL is ours, in the r2 store, with its key", () => {
  withEnv(both, () => {
    assert.deepEqual(parseOwnMediaUrl(`${MEDIA}/${ME}/${FILE}.mp4`), {
      store: "r2",
      key: `${ME}/${FILE}.mp4`,
    });
  });
});

test("a Storage URL is still ours, in the supabase store", () => {
  withEnv(both, () => {
    assert.deepEqual(parseOwnMediaUrl(`${STORAGE}/${ME}/${FILE}.webp`), {
      store: "supabase",
      key: `${ME}/${FILE}.webp`,
    });
  });
});

test("an external URL is not ours, nor one that only starts like our host", () => {
  withEnv(both, () => {
    for (const url of [
      `https://cdn.example.com/${ME}/${FILE}.mp4`,
      `${MEDIA}.evil.com/${ME}/${FILE}.mp4`,
      `${MEDIA}${ME}/${FILE}.mp4`,
      `http://media.smithcdn.net/${ME}/${FILE}.mp4`,
    ]) {
      assert.equal(isOwnMediaUrl(url), false, url);
    }
  });
});

test("a key that walks out of its prefix is refused, not normalized", () => {
  withEnv(both, () => {
    for (const key of [
      `${ME}/../${YOU}/${FILE}.mp4`,
      `${ME}/./${FILE}.mp4`,
      `${ME}/%2e%2e/${YOU}/${FILE}.mp4`,
      `${ME}//${FILE}.mp4`,
      `${ME}/${YOU}/${FILE}.mp4`,
    ]) {
      assert.equal(parseOwnMediaUrl(`${MEDIA}/${key}`), null, key);
    }
  });
});

test("only the exact shape we mint parses", () => {
  withEnv(both, () => {
    for (const key of [
      `${ME}/${FILE}.svg`,
      `${ME}/${FILE}.MP4`,
      `${ME.toUpperCase()}/${FILE}.mp4`,
      `${ME}/${FILE}.mp4?x=1`,
      `${ME}/${FILE}.mp4#t`,
      `${ME}/${FILE}`,
      `${ME}/${FILE}.mp4.html`,
      `${ME}/${FILE}.mp4\n`,
    ]) {
      assert.equal(parseOwnMediaUrl(`${MEDIA}/${key}`), null, JSON.stringify(key));
    }
  });
});

test("without a media host, R2 URLs are not ours and none can be minted", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_MEDIA_URL: undefined }, () => {
    assert.equal(mediaHost(), null);
    assert.equal(parseOwnMediaUrl(`${MEDIA}/${ME}/${FILE}.mp4`), null);
    assert.equal(r2MediaUrl(`${ME}/${FILE}.mp4`), null);
  });
  withEnv({ NEXT_PUBLIC_MEDIA_URL: "  /  " }, () => assert.equal(mediaHost(), null));
});

test("the media host is read once, trimmed, without a trailing slash", () => {
  withEnv({ ...both, NEXT_PUBLIC_MEDIA_URL: ` ${MEDIA}// ` }, () => {
    assert.equal(mediaHost(), MEDIA);
    const url = r2MediaUrl(`${ME}/${FILE}.mp4`);
    assert.equal(url, `${MEDIA}/${ME}/${FILE}.mp4`);
    assert.equal(parseOwnMediaUrl(url!)?.store, "r2");
  });
});

test("ownMediaRefs finds the owner's media at any depth, once per URL, in both stores", () => {
  withEnv(both, () => {
    const config = {
      imageBeforeUrl: `${STORAGE}/${ME}/${FILE}.mp4`,
      imageAfterUrl: `${MEDIA}/${ME}/${FILE2}.webp`,
      exits: [{ url: `${MEDIA}/${ME}/${FILE2}.webp` }, { nested: { again: `${STORAGE}/${ME}/${FILE}.mp4` } }],
      clickThroughUrl: "https://offer.example.com/?sub={click_id}",
      count: 3,
      flag: true,
      empty: null,
    };
    assert.deepEqual(
      ownMediaRefs(config, ME).sort((a, b) => a.url.localeCompare(b.url)),
      [
        { url: `${MEDIA}/${ME}/${FILE2}.webp`, store: "r2", key: `${ME}/${FILE2}.webp` },
        { url: `${STORAGE}/${ME}/${FILE}.mp4`, store: "supabase", key: `${ME}/${FILE}.mp4` },
      ],
    );
  });
});

test("ownMediaRefs never returns another owner's object", () => {
  withEnv(both, () => {
    const config = { a: `${MEDIA}/${YOU}/${FILE}.mp4`, b: `${STORAGE}/${YOU}/${FILE}.mp4` };
    assert.deepEqual(ownMediaRefs(config, ME), []);
    assert.equal(ownMediaRefs(config, YOU).length, 2);
  });
});

test("every allowed type mints a key of the shape we accept back", () => {
  for (const mime of MEDIA_ACCEPT.split(",")) {
    const key = buildMediaObjectPath(ME, mime);
    assert.ok(key && MEDIA_KEY_RE.test(key), `${mime} -> ${key}`);
    assert.ok(key.endsWith(`.${mediaExtension(mime)}`), `${mime} -> ${key}`);
  }
});

test("prototype names are not media types", () => {
  for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty", "image/svg+xml"]) {
    assert.equal(isAllowedMediaMime(name), false, name);
    assert.equal(mediaExtension(name), null, name);
    assert.equal(buildMediaObjectPath(ME, name), null, name);
  }
});
