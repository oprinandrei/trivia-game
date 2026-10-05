import { decode as decodeHtmlEntities } from 'he';
import { Category, Difficulty, QuestionType } from '../shared/types';
import { openTdbQueue, sleep } from './requestQueue';

const BASE = 'https://opentdb.com';

export class InsufficientQuestionsError extends Error {
  constructor() {
    super('Not enough questions available for the requested category/difficulty/amount');
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${BASE}/api_category.php`);
  const data = (await res.json()) as { trivia_categories: Category[] };
  return data.trivia_categories.map((c) => ({ ...c, name: decodeHtmlEntities(c.name) }));
}

export async function requestSessionToken(): Promise<string> {
  const res = await fetch(`${BASE}/api_token.php?command=request`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

export async function resetSessionToken(token: string): Promise<string> {
  const res = await fetch(`${BASE}/api_token.php?command=reset&token=${encodeURIComponent(token)}`);
  const data = (await res.json()) as { token: string };
  return data.token;
}

export interface RawQuestion {
  type: QuestionType;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

interface FetchQuestionsParams {
  amount: number;
  categoryId: number;
  difficulty: Difficulty;
  type?: QuestionType;
  token: string;
}

async function fetchQuestionsOnce(
  params: FetchQuestionsParams,
): Promise<{ code: number; questions: RawQuestion[] }> {
  return openTdbQueue.schedule(async () => {
    const url = new URL(`${BASE}/api.php`);
    url.searchParams.set('amount', String(params.amount));
    url.searchParams.set('category', String(params.categoryId));
    url.searchParams.set('difficulty', params.difficulty);
    if (params.type) url.searchParams.set('type', params.type);
    url.searchParams.set('token', params.token);

    const res = await fetch(url.toString());
    const data = (await res.json()) as {
      response_code: number;
      results: Array<{
        type: QuestionType;
        category: string;
        question: string;
        correct_answer: string;
        incorrect_answers: string[];
      }>;
    };

    const questions: RawQuestion[] = (data.results || []).map((q) => ({
      type: q.type,
      category: decodeHtmlEntities(q.category),
      question: decodeHtmlEntities(q.question),
      correct_answer: decodeHtmlEntities(q.correct_answer),
      incorrect_answers: q.incorrect_answers.map((a) => decodeHtmlEntities(a)),
    }));

    return { code: data.response_code, questions };
  });
}

/**
 * Fetches questions for a round, transparently handling OpenTDB's response
 * codes: refreshes an expired/unknown token (3), resets an exhausted one (4),
 * and backs off on rate limiting (5). Throws InsufficientQuestionsError on
 * code 1 so the caller can fall back to a different category.
 */
export async function fetchRoundQuestions(
  params: FetchQuestionsParams,
  onTokenRefresh: (newToken: string) => void,
): Promise<RawQuestion[]> {
  let token = params.token;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { code, questions } = await fetchQuestionsOnce({ ...params, token });
    switch (code) {
      case 0:
        return questions;
      case 1:
        throw new InsufficientQuestionsError();
      case 2:
        throw new Error('OpenTDB: invalid parameters (code 2)');
      case 3:
        token = await requestSessionToken();
        onTokenRefresh(token);
        continue;
      case 4:
        token = await resetSessionToken(token);
        onTokenRefresh(token);
        continue;
      case 5:
        await sleep(5200);
        continue;
      default:
        throw new Error(`OpenTDB: unexpected response code ${code}`);
    }
  }
  throw new Error('OpenTDB: gave up after repeated retries');
}
