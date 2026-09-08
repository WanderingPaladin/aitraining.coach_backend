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
    id: "q1",
    type: "mcq",
    category: "instruction_following",
    stimulus: "Prompt: Give me four fruits. Don’t include bananas.\n\nResponse: Apples, oranges, bananas, strawberries.",
    prompt: "What is the main problem?",
    options: [
      { id: "A", label: "Grammar" },
      { id: "B", label: "Factuality" },
      { id: "C", label: "Instruction following" },
      { id: "D", label: "Tone" },
    ],
    correct: "C",
    explanation: "The response includes a prohibited item: bananas.",
  },
  {
    id: "q2",
    type: "compare",
    category: "response_evaluation",
    stimulus: "Prompt: Explain gravity to a six-year-old.",
    prompt: "Which response is stronger?",
    options: [
      { id: "A", label: "Gravity is a manifestation of spacetime curvature as described by general relativity." },
      { id: "B", label: "Gravity is what pulls things toward the ground when you drop them." },
    ],
    correct: "B",
    explanation: "Response B matches the requested audience and remains understandable.",
  },
  {
    id: "q3",
    type: "mcq",
    category: "factuality",
    prompt: "Which statement is primarily an opinion?",
    options: [
      { id: "A", label: "Water freezes at approximately 0°C under standard pressure." },
      { id: "B", label: "Paris is in France." },
      { id: "C", label: "Summer is the best season." },
      { id: "D", label: "Earth orbits the Sun." },
    ],
    correct: "C",
    explanation: "“Best” is subjective.",
  },
  {
    id: "q4",
    type: "yesno",
    category: "instruction_following",
    prompt: "A user asks for exactly 50 words. The response contains 93 words but otherwise answers correctly. Should the length affect the evaluation?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
    explanation: "It violates an explicit constraint.",
  },
  {
    id: "q5",
    type: "mcq",
    category: "written_reasoning",
    prompt: "Which explanation is stronger?",
    options: [
      { id: "A", label: "Response A is better because I like it." },
      { id: "B", label: "Response A is better because it answers both parts of the user's question, while Response B addresses only the first." },
    ],
    correct: "B",
    explanation: "The second explanation provides specific evidence.",
  },
  {
    id: "q6",
    type: "mcq",
    category: "factuality",
    prompt: "An AI gives a precise current statistic without providing support. What is the best approach when research is permitted?",
    options: [
      { id: "A", label: "Assume it is correct" },
      { id: "B", label: "Verify it using an appropriate reliable source" },
      { id: "C", label: "Reject every response containing statistics" },
      { id: "D", label: "Ignore the statistic" },
    ],
    correct: "B",
    explanation: "Precise factual claims should be verified when appropriate.",
  },
  {
    id: "q7",
    type: "mcq",
    category: "instruction_following",
    stimulus: "Prompt: Suggest two vegetarian meals.\n\nResponse: Grilled chicken salad and vegetable curry.",
    prompt: "What is the primary issue?",
    options: [
      { id: "A", label: "Relevance" },
      { id: "B", label: "Chicken does not satisfy the vegetarian requirement" },
      { id: "C", label: "Grammar" },
      { id: "D", label: "Too much detail" },
    ],
    correct: "B",
    explanation: "Chicken violates the vegetarian constraint.",
  },
  {
    id: "q8",
    type: "mcq",
    category: "response_evaluation",
    prompt: "Which evaluation dimension asks whether an answer stays focused on the user's actual question?",
    options: [
      { id: "A", label: "Relevance" },
      { id: "B", label: "Creativity" },
      { id: "C", label: "Formatting" },
      { id: "D", label: "Length" },
    ],
    correct: "A",
    explanation: "Relevance measures focus on the actual request.",
  },
  {
    id: "q9",
    type: "yesno",
    category: "response_evaluation",
    prompt: "An answer contains several accurate facts but never addresses what the user asked. Should it receive a strong overall rating?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "no",
    explanation: "Accuracy alone does not make an answer relevant or complete.",
  },
  {
    id: "q10",
    type: "mcq",
    category: "written_reasoning",
    prompt: "Why is this weak evaluation feedback: “Response B is bad.”?",
    options: [
      { id: "A", label: "It is too polite" },
      { id: "B", label: "It does not identify the specific problem" },
      { id: "C", label: "Evaluators should never criticize responses" },
      { id: "D", label: "It contains a factual error" },
    ],
    correct: "B",
    explanation: "Useful feedback identifies the exact issue.",
  },
  {
    id: "q11",
    type: "mcq",
    category: "attention_to_detail",
    stimulus: "Prompt: List these California cities alphabetically: Sacramento, San Diego, Los Angeles.\n\nResponse: San Diego\nLos Angeles\nSacramento",
    prompt: "What is wrong?",
    options: [
      { id: "A", label: "One city isn't in California" },
      { id: "B", label: "The order isn't alphabetical" },
      { id: "C", label: "The response has too many cities" },
      { id: "D", label: "Nothing" },
    ],
    correct: "B",
    explanation: "Correct order: Los Angeles, Sacramento, San Diego.",
  },
  {
    id: "q12",
    type: "mcq",
    category: "factuality",
    prompt: "If you're unsure whether a factual statement is correct and research is permitted, what is the best approach?",
    options: [
      { id: "A", label: "Guess" },
      { id: "B", label: "Assume the AI knows" },
      { id: "C", label: "Verify using reliable information" },
      { id: "D", label: "Approve it if the wording sounds confident" },
    ],
    correct: "C",
    explanation: "Verification is preferable to guessing.",
  },
  {
    id: "q13",
    type: "mcq",
    category: "attention_to_detail",
    stimulus: "Prompt: Give three tips for saving money. Each tip should be one sentence.\n\nResponse: Create a monthly budget.\nCompare prices before major purchases.\nReduce unnecessary subscriptions because many people subscribe to services they rarely use, and canceling those services can save substantial money over time. Another useful strategy is negotiating recurring expenses.",
    prompt: "What is the primary issue?",
    options: [
      { id: "A", label: "The third item does not remain one sentence" },
      { id: "B", label: "The advice is financially illegal" },
      { id: "C", label: "The response has fewer than three tips" },
      { id: "D", label: "There is no problem" },
    ],
    correct: "A",
    explanation: "The third tip contains an additional sentence and extra strategy.",
  },
  {
    id: "q14",
    type: "mcq",
    category: "response_evaluation",
    stimulus: "Prompt: Give a neutral summary of both sides of an argument.\n\nResponse: The response strongly praises one side and insults the other.",
    prompt: "Which dimension is most clearly affected?",
    options: [
      { id: "A", label: "Appropriate tone/objectivity" },
      { id: "B", label: "Spelling" },
      { id: "C", label: "Length" },
      { id: "D", label: "Formatting" },
    ],
    correct: "A",
    explanation: "The requested neutrality is violated.",
  },
  {
    id: "q15",
    type: "mcq",
    category: "instruction_following",
    stimulus: "Prompt: Recommend a laptop under $800.\n\nResponse: The response recommends a $1,399 laptop.",
    prompt: "What is the primary problem?",
    options: [
      { id: "A", label: "The laptop may be good" },
      { id: "B", label: "The response ignores the user's budget constraint" },
      { id: "C", label: "The answer is too short" },
      { id: "D", label: "The brand may be unpopular" },
    ],
    correct: "B",
    explanation: "The recommendation violates the explicit budget.",
  },
  {
    id: "q16",
    type: "mcq",
    category: "written_reasoning",
    prompt: "Which feedback is stronger?",
    options: [
      { id: "A", label: "This is probably wrong." },
      { id: "B", label: "The response states that Tokyo is the capital of China, which is factually incorrect; Beijing is China's capital." },
    ],
    correct: "B",
    explanation: "The second feedback is specific and evidence-based.",
  },
  {
    id: "q17",
    type: "mcq",
    category: "instruction_following",
    stimulus: "Prompt: Explain the concept without using technical jargon.\n\nResponse: The algorithm minimizes a non-convex loss function through stochastic gradient descent.",
    prompt: "What is the main issue?",
    options: [
      { id: "A", label: "Grammar" },
      { id: "B", label: "The response violates the requested simplicity constraint" },
      { id: "C", label: "The answer is necessarily factually false" },
      { id: "D", label: "It is too polite" },
    ],
    correct: "B",
    explanation: "The response uses technical jargon despite the explicit instruction.",
  },
  {
    id: "q18",
    type: "mcq",
    category: "factuality",
    prompt: "An AI answer includes a quotation supposedly from a famous researcher. You cannot locate the quotation in any reliable source. What is the most appropriate concern?",
    options: [
      { id: "A", label: "Potential fabricated quotation" },
      { id: "B", label: "The response is too concise" },
      { id: "C", label: "The researcher isn't famous enough" },
      { id: "D", label: "No concern" },
    ],
    correct: "A",
    explanation: "The quote may be fabricated or misattributed.",
  },
  {
    id: "q19",
    type: "mcq",
    category: "response_evaluation",
    stimulus: "Prompt: Give one advantage and one disadvantage of electric vehicles.\n\nResponse: Advantages include lower operating costs, quieter operation, reduced tailpipe emissions, and convenient home charging.",
    prompt: "What's missing?",
    options: [
      { id: "A", label: "More advantages" },
      { id: "B", label: "A disadvantage" },
      { id: "C", label: "Technical vocabulary" },
      { id: "D", label: "A title" },
    ],
    correct: "B",
    explanation: "The response omits half of the request.",
  },
  {
    id: "q20",
    type: "mcq",
    category: "written_reasoning",
    stimulus: "Prompt: Respond professionally and politely.",
    prompt: "Which response is stronger?",
    options: [
      { id: "A", label: "That's a stupid idea." },
      { id: "B", label: "I don't think that approach would work well here because it may create additional costs. A simpler alternative would be to test the smaller version first." },
    ],
    correct: "B",
    explanation: "The second response remains professional, explains the concern, and offers an alternative.",
  },
  {
    id: "p1",
    type: "compare",
    category: "written_reasoning",
    helper: "Practical task",
    stimulus: "Prompt: Recommend three inexpensive activities for a rainy day at home. Keep the entire response under 50 words.",
    prompt: "Which response better matches the prompt?",
    options: [
      { id: "A", label: "Read a book, try a simple home workout, or cook something using ingredients you already have." },
      { id: "B", label: "There are many things to do on a rainy day. You could read, watch movies, cook, exercise, drive somewhere, visit friends, play games, start a hobby, or reorganize your entire home." },
    ],
    correct: "A",
    explanation: "A gives three at-home activities concisely. B lists extra options and includes leaving home.",
  },
  {
    id: "p2",
    type: "written",
    category: "factuality",
    helper: "Practical task",
    stimulus: "Prompt: Explain why sleep is important in two sentences.\n\nResponse: Sleep is important because it allows your body and brain to recover. Every adult must sleep exactly nine hours every night or they will develop serious health problems.",
    prompt: "What is the main problem with the second sentence of this response?",
    placeholder: "Name the problem in the second sentence…",
    keywords: ["second", "nine", "absolute", "unsupported", "overbroad", "vary", "must", "health"],
    explanation: "The second sentence makes an overly absolute and unsupported claim.",
  },
  {
    id: "p3",
    type: "compare",
    category: "response_evaluation",
    helper: "Practical task",
    stimulus: "Prompt: Write a professional, friendly one-sentence message declining tomorrow's meeting.",
    prompt: "Which response better matches the request?",
    options: [
      { id: "A", label: "Can't make it." },
      { id: "B", label: "Thank you for the invitation, but unfortunately I won't be available for tomorrow's meeting." },
    ],
    correct: "B",
    explanation: "B is a professional, friendly one-sentence decline. A is abrupt.",
  },
];

export function publicQuestions(): PublicQuestion[] {
  return ASSESSMENT_QUESTIONS.map(({ category: _c, correct: _k, keywords: _w, explanation: _e, ...rest }) => rest);
}

export function questionById(id: string) {
  return ASSESSMENT_QUESTIONS.find((item) => item.id === id);
}
