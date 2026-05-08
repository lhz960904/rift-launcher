// Command scoring — adapted from kunkun / Bits UI command-score.
// Weights tuned for app-launcher use case (prefix bonus, word-jump bonus,
// distance penalty). Diacritics-normalized so "cafe" matches "Café".

const SCORE_CONTINUE_MATCH = 1.0
const SCORE_SPACE_WORD_JUMP = 0.9
const SCORE_NON_SPACE_WORD_JUMP = 0.8
const SCORE_CHARACTER_JUMP = 0.17
const SCORE_TRANSPOSITION = 0.1
const PENALTY_SKIPPED = 0.999
const PENALTY_CASE_MISMATCH = 0.9999
const PENALTY_NOT_COMPLETE = 0.99
const PENALTY_DISTANCE_FROM_START = 0.9

const IS_GAP = /[\\/_+.#"@[({&]/
const COUNT_SPACE_WORD_JUMP = / |-/

const COMBINING_MARKS = /[̀-ͯ]/g

export function normalize(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '')
}

function commandScore(stringToScore: string, abbreviation: string): number {
  const lowerString = normalize(stringToScore).toLowerCase()
  const lowerAbbreviation = normalize(abbreviation).toLowerCase()
  if (!lowerAbbreviation) return SCORE_CONTINUE_MATCH
  if (!lowerString) return 0

  const memo = new Map<string, number>()

  function recurse(stringIndex: number, abbreviationIndex: number): number {
    if (abbreviationIndex === lowerAbbreviation.length) {
      return stringIndex === lowerString.length ? SCORE_CONTINUE_MATCH : PENALTY_NOT_COMPLETE
    }
    const key = `${stringIndex}|${abbreviationIndex}`
    const memoed = memo.get(key)
    if (memoed !== undefined) return memoed

    const c = lowerAbbreviation[abbreviationIndex]
    let index = lowerString.indexOf(c, stringIndex)
    let highScore = 0

    while (index >= 0) {
      let score = recurse(index + 1, abbreviationIndex + 1)
      if (index === stringIndex) {
        score *= SCORE_CONTINUE_MATCH
      } else if (COUNT_SPACE_WORD_JUMP.test(lowerString[index - 1])) {
        score *= SCORE_SPACE_WORD_JUMP
      } else if (IS_GAP.test(lowerString[index - 1])) {
        score *= SCORE_NON_SPACE_WORD_JUMP
      } else {
        score *= SCORE_CHARACTER_JUMP
        if (index !== 0) {
          score *= Math.pow(PENALTY_SKIPPED, index - stringIndex)
        }
      }
      if (
        index < stringToScore.length &&
        stringToScore[index] !== abbreviation[abbreviationIndex]
      ) {
        score *= PENALTY_CASE_MISMATCH
      }
      if (score > highScore) highScore = score
      index = lowerString.indexOf(c, index + 1)
    }
    memo.set(key, highScore)
    return highScore
  }

  let result = recurse(0, 0)
  // Penalize matches that start far from the beginning
  if (result > 0) {
    const firstMatch = lowerString.indexOf(lowerAbbreviation[0])
    if (firstMatch > 0) {
      result *= Math.pow(PENALTY_DISTANCE_FROM_START, Math.min(firstMatch, 10))
    }
  }
  return result
}

/**
 * Score a candidate against the user's query.
 * Returns 0 for "no useful match" (caller should filter out).
 */
export function scoreEntry(
  name: string,
  aliases: string[],
  query: string,
  mruCount = 0
): number {
  if (!query) return 0
  // search across name + each alias; take the best
  let best = commandScore(name, query)
  for (const alias of aliases) {
    const s = commandScore(alias, query)
    if (s > best) best = s
  }
  if (best <= 0) return 0
  // MRU boost: log scale so a 10x-used app gets ~+25% boost
  const boost = 1 + 0.15 * Math.log(1 + mruCount)
  return best * boost
}
