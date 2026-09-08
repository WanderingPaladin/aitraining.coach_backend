export const COURSE_SLUG = 'ai-training-foundations';
export const PASS_SCORE = 75;

export const SCORE_WEIGHTS = {
  instruction_following: 0.25,
  response_evaluation: 0.25,
  factuality: 0.2,
  written_reasoning: 0.2,
  attention_to_detail: 0.1,
} as const;

export type ScoreCategory = keyof typeof SCORE_WEIGHTS;

export type PublicQuestion = {
  id: string;
  type: 'mcq' | 'yesno' | 'compare' | 'written';
  prompt: string;
  stimulus?: string;
  options?: Array<{ id: string; label: string }>;
  helper?: string;
  placeholder?: string;
};

type ScoredQuestion = PublicQuestion & {
  category: ScoreCategory;
  correct?: string;
  keywords?: string[];
  explanation: string;
};

export const ASSESSMENT_QUESTIONS: ScoredQuestion[] = [
  {
    id: 'q1',
    type: 'mcq',
    category: 'instruction_following',
    prompt: 'What is the main problem with this response?',
    stimulus:
      'Prompt: Give me four fruits. Don’t include bananas.\n\nResponse: Apples, oranges, bananas, strawberries.',
    options: [
      { id: 'A', label: 'Grammar' },
      { id: 'B', label: 'Factuality' },
      { id: 'C', label: 'Instruction following' },
      { id: 'D', label: 'Tone' },
    ],
    correct: 'C',
    explanation: 'The user asked for four fruits and explicitly excluded bananas. Including bananas is an instruction-following miss.',
  },
  {
    id: 'q2',
    type: 'compare',
    category: 'response_evaluation',
    prompt: 'Which response better matches the requested audience?',
    stimulus: 'Prompt: Explain gravity to a six-year-old.',
    options: [
      {
        id: 'A',
        label: 'Gravity is a manifestation of spacetime curvature as described by general relativity.',
      },
      {
        id: 'B',
        label: 'Gravity is what pulls things toward the ground when you drop them.',
      },
    ],
    correct: 'B',
    explanation: 'B uses simple language a six-year-old can understand. A is technically dense and misses the audience requirement.',
  },
  {
    id: 'q3',
    type: 'mcq',
    category: 'factuality',
    prompt: 'Which statement is primarily an opinion?',
    options: [
      { id: 'A', label: 'Water freezes at 0°C under standard conditions.' },
      { id: 'B', label: 'Paris is in France.' },
      { id: 'C', label: 'Summer is the best season.' },
      { id: 'D', label: 'Earth orbits the Sun.' },
    ],
    correct: 'C',
    explanation: '“Best season” is a preference, not a verifiable fact.',
  },
  {
    id: 'q4',
    type: 'yesno',
    category: 'instruction_following',
    prompt: 'The user requested exactly 50 words. The response is otherwise strong but contains 93 words. Should this affect the evaluation?',
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    correct: 'yes',
    explanation: 'Explicit length limits are part of the task. A strong answer can still be a poor fit if it ignores a stated constraint.',
  },
  {
    id: 'q5',
    type: 'compare',
    category: 'written_reasoning',
    prompt: 'Which justification is stronger?',
    options: [
      { id: 'A', label: 'Response A is better because I like it.' },
      {
        id: 'B',
        label: 'Response A is better because it answers both parts of the question, while Response B addresses only the first.',
      },
    ],
    correct: 'B',
    explanation: 'Strong feedback cites a specific difference in the responses, not a personal preference.',
  },
  {
    id: 'q6',
    type: 'mcq',
    category: 'factuality',
    prompt: 'An AI response includes a very specific current statistic with no source or qualification. What is the best action?',
    options: [
      { id: 'A', label: 'Automatically approve it' },
      { id: 'B', label: 'Verify it if research is permitted' },
      { id: 'C', label: 'Reject every statistic' },
      { id: 'D', label: 'Ignore it because it sounds confident' },
    ],
    correct: 'B',
    explanation: 'Specific unsupported statistics need checking when research is allowed. Confidence is not evidence.',
  },
  {
    id: 'q7',
    type: 'mcq',
    category: 'instruction_following',
    prompt: 'What is the main problem with this response?',
    stimulus: 'Prompt: Give two vegetarian meals.\n\nResponse: Grilled chicken salad and vegetable curry.',
    options: [
      { id: 'A', label: 'It is too short' },
      { id: 'B', label: 'Chicken is not vegetarian' },
      { id: 'C', label: 'The tone is unfriendly' },
      { id: 'D', label: 'It uses too many adjectives' },
    ],
    correct: 'B',
    explanation: 'The prompt required vegetarian meals. Chicken salad violates that constraint.',
  },
  {
    id: 'q8',
    type: 'mcq',
    category: 'response_evaluation',
    prompt: 'Which quality describes staying focused on the user’s question?',
    options: [
      { id: 'A', label: 'Relevance' },
      { id: 'B', label: 'Formatting' },
      { id: 'C', label: 'Creativity' },
      { id: 'D', label: 'Length' },
    ],
    correct: 'A',
    explanation: 'Relevance is whether the answer stays on the asked topic.',
  },
  {
    id: 'q9',
    type: 'yesno',
    category: 'response_evaluation',
    prompt: 'An answer contains many correct facts but never answers the actual question. Should it receive a high rating?',
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
    correct: 'no',
    explanation: 'Correct facts that miss the question are still a weak response. The user’s request comes first.',
  },
  {
    id: 'q10',
    type: 'written',
    category: 'written_reasoning',
    prompt: 'Why is “B is bad” weak evaluation feedback? Write one or two sentences.',
    placeholder: 'Explain what is missing from this feedback…',
    keywords: ['specific', 'evidence', 'explain', 'reason', 'why', 'problem', 'detail', 'example', 'because'],
    explanation: 'It does not identify a specific problem or give evidence from the response.',
  },
  {
    id: 'q11',
    type: 'mcq',
    category: 'attention_to_detail',
    prompt: 'What is the main problem with this response?',
    stimulus: 'Prompt: List three California cities alphabetically.\n\nResponse:\nSan Diego\nLos Angeles\nSacramento',
    options: [
      { id: 'A', label: 'One city is not in California' },
      { id: 'B', label: 'There are only two cities' },
      { id: 'C', label: 'The list is not in alphabetical order' },
      { id: 'D', label: 'The names are misspelled' },
    ],
    correct: 'C',
    explanation: 'The correct alphabetical order is Los Angeles, Sacramento, San Diego.',
  },
  {
    id: 'q12',
    type: 'mcq',
    category: 'factuality',
    prompt: 'When you are uncertain whether a factual claim is correct, what should you do?',
    options: [
      { id: 'A', label: 'Assume the AI knows' },
      { id: 'B', label: 'Guess' },
      { id: 'C', label: 'Verify using reliable information when permitted' },
      { id: 'D', label: 'Approve it if it sounds confident' },
    ],
    correct: 'C',
    explanation: 'Uncertain factual claims should be checked with reliable sources when the task allows research.',
  },
  {
    id: 'q13',
    type: 'mcq',
    category: 'instruction_following',
    prompt: 'What constraint did this response miss?',
    stimulus:
      'Prompt: Recommend two free activities in New York City. Use bullet points. Do not recommend museums.\n\nResponse:\n- Walk through Central Park\n- Visit the Metropolitan Museum of Art',
    options: [
      { id: 'A', label: 'It used bullet points' },
      { id: 'B', label: 'It recommended a museum' },
      { id: 'C', label: 'Central Park is not in New York City' },
      { id: 'D', label: 'It gave only one activity' },
    ],
    correct: 'B',
    explanation: 'The Metropolitan Museum of Art is a museum, which the prompt explicitly excluded.',
  },
  {
    id: 'q14',
    type: 'compare',
    category: 'response_evaluation',
    prompt: 'Which response better follows both the count and length requirements?',
    stimulus: 'Prompt: Give me two advantages of working remotely. Keep the answer under 30 words.',
    options: [
      {
        id: 'A',
        label:
          'Remote work can reduce commuting time and provide greater flexibility in where employees perform their work.',
      },
      {
        id: 'B',
        label:
          'Remote work has many benefits. First, it eliminates commuting. Second, employees may have more scheduling flexibility. Third, it can reduce office expenses. Fourth, workers can live anywhere.',
      },
    ],
    correct: 'A',
    explanation: 'A gives two advantages within the word limit. B lists more than two advantages and is longer than requested.',
  },
  {
    id: 'q15',
    type: 'mcq',
    category: 'factuality',
    prompt: 'Which part of this response most needs verification?',
    stimulus:
      '“A 2024 Global Sleep Institute study of 48,217 adults found that people who nap for 17 minutes are 34% more productive.”',
    options: [
      { id: 'A', label: 'The use of the word “people”' },
      { id: 'B', label: 'The highly specific study name, sample size, and statistic' },
      { id: 'C', label: 'The mention of sleep' },
      { id: 'D', label: 'The sentence length' },
    ],
    correct: 'B',
    explanation: 'Precise study names, sample sizes, and percentages are easy to fabricate and should be checked.',
  },
  {
    id: 'q16',
    type: 'written',
    category: 'written_reasoning',
    prompt:
      'A user asked for a one-sentence explanation of photosynthesis for a 10-year-old. Response A uses dense scientific vocabulary. Response B says plants use sunlight to make the food they need to grow. In one or two sentences, explain why B is the better evaluation choice.',
    placeholder: 'Decision, evidence, impact…',
    keywords: ['simple', 'audience', '10', 'child', 'clear', 'understand', 'vocabulary', 'language', 'requested'],
    explanation: 'B matches the requested audience. A uses language that a 10-year-old is unlikely to understand.',
  },
  {
    id: 'q17',
    type: 'mcq',
    category: 'attention_to_detail',
    prompt: 'What did this response miss?',
    stimulus:
      'Prompt: Give exactly three benefits of exercise. Each benefit must be no more than six words. Do not mention weight loss.\n\nResponse:\n- Improves cardiovascular health\n- Supports better sleep quality\n- Can help people lose weight',
    options: [
      { id: 'A', label: 'It gave fewer than three benefits' },
      { id: 'B', label: 'It mentioned weight loss, which was forbidden' },
      { id: 'C', label: 'It used bullet points' },
      { id: 'D', label: 'The benefits are unrelated to exercise' },
    ],
    correct: 'B',
    explanation: 'The third bullet mentions weight loss, which the prompt explicitly forbids.',
  },
  {
    id: 'q18',
    type: 'mcq',
    category: 'written_reasoning',
    prompt: 'Which comment best follows Decision → Evidence → Impact?',
    options: [
      { id: 'A', label: 'A is better. Period.' },
      {
        id: 'B',
        label:
          'Response A is better because it gives exactly three suggestions as requested, while Response B provides five. Therefore, Response A follows the user’s instructions more closely.',
      },
      { id: 'C', label: 'I would pick A if I were the user.' },
      { id: 'D', label: 'B sounds more complete, so it wins.' },
    ],
    correct: 'B',
    explanation: 'B states a decision, cites a concrete difference, and explains why that difference matters.',
  },
  {
    id: 'q19',
    type: 'compare',
    category: 'response_evaluation',
    prompt: 'Which response better matches the prompt?',
    stimulus: 'Prompt: Recommend three inexpensive activities for a rainy day at home. Keep the entire response under 50 words.',
    options: [
      {
        id: 'A',
        label: 'Read a book, try a simple home workout, or cook something using ingredients you already have.',
      },
      {
        id: 'B',
        label:
          'There are many things you can do on a rainy day. You could read a book, watch movies, cook, exercise, drive somewhere, visit friends, play video games, or start a new hobby.',
      },
    ],
    correct: 'A',
    explanation: 'A gives three at-home activities concisely. B lists more than three, includes leaving the house, and runs long.',
  },
  {
    id: 'q20',
    type: 'compare',
    category: 'instruction_following',
    prompt: 'Which response better follows the request for a professional, friendly one-sentence decline?',
    stimulus: 'Prompt: Write a professional, friendly one-sentence message declining a meeting tomorrow.',
    options: [
      { id: 'A', label: 'Can’t make it.' },
      {
        id: 'B',
        label: 'Thank you for the invitation, but unfortunately I won’t be available for tomorrow’s meeting.',
      },
    ],
    correct: 'B',
    explanation: 'B is one complete, polite, professional sentence. A is abrupt and not professional in tone.',
  },
];

export function publicQuestions(): PublicQuestion[] {
  return ASSESSMENT_QUESTIONS.map(({ category: _c, correct: _k, keywords: _w, explanation: _e, ...rest }) => rest);
}

export function questionById(id: string) {
  return ASSESSMENT_QUESTIONS.find((item) => item.id === id);
}
