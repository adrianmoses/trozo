# Bug Fix: Validator drops valid chunks

| Field            | Value                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| id               | 003                                                                                                   |
| status           | fixed                                                                                                 |
| created          | 2026-09-27                                                                                            |
| reporter         | agent (found while running the 005 evals)                                                             |
| environment      | all: the chunk service's validate/repair and highlight steps, local and Docker                        |
| affected-feature | 001 chunk service (validate/repair, lemma matching); visible in 002 (cards, underlines), 005 (recall) |

---

## Context <!-- required -->

Feature 005 was iterating on prompt p2, which adds a rule that the pattern carrying a phrase's meaning must always be a chunk. On dev the rule seemed to have no effect. "You're so lucky" still returned no chunks, "Good luck on your exam" returned _en tu examen_ but not _buena suerte_, and "Can I get a straw?" returned a request frame but never _pajita_ with its regional variants.

The model was generating those chunks. Then `validate_repair` dropped them as "not found in translation", although they were in it:

```
>>> contains_chunk("Buena suerte con tu examen.", "buena suerte")
False
>>> contains_chunk("¡Tienes mucha suerte!", "tener suerte")
False
>>> contains_chunk("¿Me da una pajita?", "pajita")
False
```

The service threw the repair errors away (`draft, _errors = …`), so a response gave no sign that anything had been removed.

---

## Problem Scope <!-- required -->

### Root Cause <!-- required -->

`contains_chunk` compared lemmas of the chunk surface with lemmas of the text, and the two sides were normalized differently in two ways:

1. **A clitic regex applied to chunk surfaces only.** `_REFLEXIVE` stripped any ending that looked like a clitic (_-se_, _-te_, _-la_ …) from words that looked like infinitives, so that _postularse_ would match _postular_. It also fired on nouns: _suer-te_ → `suer`, _par-te_ → `par`, _muer-te_ → `muer`. The text side kept `suerte`.

   On the text side, spaCy expands a verb with attached clitics into a two-word lemma (_darme_ → `dar yo`). The prefix fallback that covers mis-lemmatized verbs needs a stem of at least 3 letters, so short verbs (_dar_, _ir_, _ver_) could not match at all. That is how _darse cuenta de_, a seed chunk, failed.

2. **Chunk nouns lemmatized out of context.** spaCy lemmatizes a bare surface without context: _pajita_ alone is tagged ADJ with lemma `pajito`, while in the sentence it is `pajita`. The chunk was compared by lemma only, so a noun could fail to match its own word.

The same code path produces `example.highlight` and `translation_highlight`, which drive the UI underlines.

### Blast Radius <!-- required -->

**Severity:** High

- **Chunks silently dropped in the product.** Of the 309 forms in the 005 seed (expected, accepted and also-valid surfaces), 23 (7%) were rejected even when they appeared word for word inside a sentence, and 10 even when the text was the form itself. These include everyday chunks (_buena suerte_, _tener suerte_), the seed-verified chunk _darse cuenta de_, and regional nouns, the product's differentiator (_pajita_, _frijoles_, _pibes_, _chavales_, _lana_, _guita_, _caña_, _crispetas_).
- **What users saw:** a dropped chunk left the card set smaller or empty ("Nothing worth chunking here" for "You're so lucky"), with no error. When every chunk was dropped, the retry path spent a second LLM call on a draft that had been valid.
- **Eval recall understated since 001.** Recall misses on dev in 005 were partly this bug, not the prompt, and any prompt change aimed at coverage could not be measured.
- **Not affected:** seed matching and self-consistency. Both compare `lemma_key` against `lemma_key`, so the same mangling happened on both sides. No data loss: the chunk service holds no user data, and saved chunks (004) only contain chunks that survived.
- Not Critical: the service returned valid, useful responses; they were incomplete.

### Spec Gap <!-- optional -->

- **ARCHITECTURE requires the translation to contain every chunk "(lemma-level)"**, but nothing specified or tested what lemma-level means for clitics, short verbs, or nouns out of context. The 001 tests covered only the cases the regex was written for (_postularse_, _darse_ in context), not what it could break.
- **Validation drops were not observable.** Silent repairs hid this bug for three features. `meta.dropped` now exposes them. The eval runner could report a drop rate per run; that is a candidate for 005 or a later item.

---

## Fix Applied <!-- required -->

### What Changed <!-- required -->

`services/chunker/app/pipeline/spanish.py`:

- **Regex removed.** `_REFLEXIVE` is gone. Instead, `_lemma()` keeps only the first word when spaCy gives a VERB/AUX token a multi-word lemma (`postular él` → `postular`, `dar yo` → `dar`). This applies on both the chunk side and the text side, so clitics are handled where spaCy actually detects a verb, and nouns are never touched.
- **Either form can match.** `contains_chunk` and `highlight_range` now match each chunk token on its lemma **or** its surface form, against the text token's lemma or surface form, still backed by the verb-stem fallback. A noun that lemmatizes differently alone still matches its own word.
- **Keys unchanged in shape.** `lemma_key` (seed index, consistency) uses the same `_lemma()`, so clitic verbs still share a key with their base (_postularse_ = _postular_).

`services/chunker/app/pipeline/cache.py`:

- **`MATCHER_VERSION = 2` is part of the cache key.** Cached responses were validated by the old matcher and had lost chunks, so a fix that kept serving them would fix nothing. Bump this whenever validation or matching changes. The full-mode key derives from the fast key, so it moves too.

`services/chunker/app/models.py`, `app/main.py`, `packages/schema`:

- **`Meta.dropped`:** a list of `"chunk '…': …; dropped"` messages from validation, empty when nothing was dropped. It is optional in the contract (ARCHITECTURE: fields added later must be optional), and the JSON Schema and TS types are regenerated. It exposes validation drops instead of hiding them.

This fixes the cause, the asymmetric normalization between chunk and text, rather than loosening validation. Chunks that are genuinely absent are still dropped, and the existing negative tests still pass. A live check shows a correct drop that is now visible: for "You're so lucky", the model's chunk _tienes suerte_ is dropped because the translation _Qué suerte tienes_ reverses the word order, and `meta.dropped` says so.

### Test Cases Added <!-- required -->

All written before the fix; each failed before and passes after:

- `test_spanish.py::test_nouns_that_look_like_clitic_verbs_are_not_mangled`: _buena suerte_, _tener suerte_, _por mi parte_ are found in sentences containing them.
- `test_spanish.py::test_short_verbs_with_an_attached_clitic_match`: _darse una ducha_ in "darme una ducha", _darse cuenta de_, _verse_ in "nos vemos"; _darse cuenta de_ still needs its _de_.
- `test_spanish.py::test_nouns_lemmatized_differently_alone_match_their_surface`: _pajita_, _frijoles_, _pibes_.
- `test_spanish.py::test_every_form_is_found_in_a_sentence_that_contains_it`: the 23 seed forms that failed, plus clitic forms that already passed (_postularse_, _pasarlo_, _quedarse sin_, _tomarse_).
- `test_spanish.py::test_clitic_verbs_still_share_a_key_with_their_base`: keys for seed and consistency matching keep conflating clitic verbs, and no longer mangle _suerte_.
- `test_validate.py::test_valid_chunk_with_a_noun_ending_in_te_is_kept`: `validate_repair` keeps _buena suerte_ with no errors.
- `test_cache.py::test_cache_key_includes_the_matcher_version`: bumping `MATCHER_VERSION` changes the key.
- `test_api.py::test_dropped_chunks_are_reported_in_meta` and `test_meta_dropped_is_empty_when_nothing_was_dropped`: validation drops appear in `meta.dropped`.

### Test Evidence <!-- required -->

Before the fix:

```
FAILED tests/test_spanish.py::test_nouns_that_look_like_clitic_verbs_are_not_mangled
FAILED tests/test_spanish.py::test_short_verbs_with_an_attached_clitic_match
FAILED tests/test_spanish.py::test_nouns_lemmatized_differently_alone_match_their_surface
FAILED tests/test_spanish.py::test_every_form_is_found_in_a_sentence_that_contains_it
FAILED tests/test_spanish.py::test_clitic_verbs_still_share_a_key_with_their_base
FAILED tests/test_validate.py::test_valid_chunk_with_a_noun_ending_in_te_is_kept
FAILED tests/test_cache.py::test_cache_key_includes_the_matcher_version - Att...
7 failed, 23 passed in 0.95s
FAILED tests/test_api.py::test_dropped_chunks_are_reported_in_meta - KeyError...
FAILED tests/test_api.py::test_meta_dropped_is_empty_when_nothing_was_dropped
2 failed, 10 passed in 1.36s
```

After the fix:

```
tests/test_spanish.py::test_nouns_that_look_like_clitic_verbs_are_not_mangled PASSED
tests/test_spanish.py::test_short_verbs_with_an_attached_clitic_match PASSED
tests/test_spanish.py::test_nouns_lemmatized_differently_alone_match_their_surface PASSED
tests/test_spanish.py::test_every_form_is_found_in_a_sentence_that_contains_it PASSED
tests/test_spanish.py::test_clitic_verbs_still_share_a_key_with_their_base PASSED
tests/test_validate.py::test_valid_chunk_with_a_noun_ending_in_te_is_kept PASSED
tests/test_cache.py::test_cache_key_includes_the_matcher_version PASSED
tests/test_api.py::test_dropped_chunks_are_reported_in_meta PASSED
tests/test_api.py::test_meta_dropped_is_empty_when_nothing_was_dropped PASSED

$ uv run pytest -q            # services/chunker
84 passed in 2.56s
$ uv run ruff check app tests
All checks passed!
$ pnpm --filter @trozo/schema test   # tsc --noEmit on regenerated types
(clean)
$ pnpm --filter web test
      Tests  118 passed | 6 skipped (124)
```

Blast radius re-measured on the 309 seed forms:

```
before: fails contains_chunk(f, f): 10    fails inside a sentence: 23
after:  fails contains_chunk(f, f): []    fails inside a sentence: []
```

Live, prompt p1, fast mode (fresh generation, matcher version 2):

```
'Good luck on your exam' -> 'Buena suerte en tu examen.'
   chunks: [('buena suerte', ['neutral'], ['mucha suerte', 'que te vaya bien'])]
   dropped: []
'Can I get a straw?' -> '¿Me puede traer una pajita, por favor?'
   chunks: [('me puede traer', …), ('pajita', ['ES', 'neutral'], ['popote', 'sorbete', 'pitillo'])]
   dropped: []
"You're so lucky" -> 'Qué suerte tienes.'
   chunks: [('qué suerte', ['neutral'], [])]
   dropped: ["chunk 'tienes suerte': example 'Qué suerte tienes.' does not contain the chunk (lemma-level); dropped"]
```

Before the fix, all three returned without these chunks (005 dev run `20260927T062404Z-p1-dev-fast`).
