export const COURSE_SLUG = 'ai-training-foundations';
export const PASS_SCORE = 75;
export const MODULE_COUNT = 8;
export const ATTEMPT_QUESTION_COUNT = 24;
export const ATTEMPT_PRACTICAL_COUNT = 2;

export const SCORE_WEIGHTS = {
  instruction_following: 0.25,
  response_evaluation: 0.25,
  factuality: 0.2,
  written_reasoning: 0.2,
  attention_to_detail: 0.1,
} as const;

export type ScoreCategory = keyof typeof SCORE_WEIGHTS;

export const CATEGORY_TARGETS: Record<ScoreCategory, number> = {
  instruction_following: 5,
  response_evaluation: 5,
  factuality: 5,
  written_reasoning: 5,
  attention_to_detail: 4,
};

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
    prompt: "A prompt asks for exactly four fruits and says not to include bananas. Which response violates the prompt?",
    options: [
      { id: "A", label: "Apples, pears, oranges, grapes" },
      { id: "B", label: "Apples, bananas, oranges, grapes" },
      { id: "C", label: "Pears, peaches, plums, grapes" },
      { id: "D", label: "Apples, oranges, kiwi, melon" },
    ],
    correct: "B",
    explanation: "Bananas were explicitly prohibited.",
  },
  {
    id: "q2",
    type: "mcq",
    category: "instruction_following",
    prompt: "The user asks for two bullet points. A response gives three excellent bullet points. What is the main issue?",
    options: [
      { id: "A", label: "Tone" },
      { id: "B", label: "Instruction following" },
      { id: "C", label: "Factuality" },
      { id: "D", label: "Safety" },
    ],
    correct: "B",
    explanation: "The response violates the requested count.",
  },
  {
    id: "q3",
    type: "compare",
    category: "instruction_following",
    prompt: "Prompt: 'Explain gravity to a six-year-old without technical jargon.' Which answer better follows the instruction?",
    options: [
      { id: "A", label: "Gravity is the curvature of spacetime caused by mass-energy." },
      { id: "B", label: "Gravity is the pull that makes things fall toward the ground." },
    ],
    correct: "B",
    explanation: "The second answer is age-appropriate and avoids jargon.",
  },
  {
    id: "q4",
    type: "yesno",
    category: "instruction_following",
    prompt: "Prompt: 'Write one sentence under 20 words.' The response uses 17 words but two sentences. Is there an issue?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
    explanation: "It violates the one-sentence requirement.",
  },
  {
    id: "q5",
    type: "mcq",
    category: "instruction_following",
    prompt: "Prompt: 'Recommend a laptop under $800.' The response recommends a $1,399 model. What matters most?",
    options: [
      { id: "A", label: "The brand" },
      { id: "B", label: "The budget violation" },
      { id: "C", label: "The answer length" },
      { id: "D", label: "The screen size" },
    ],
    correct: "B",
    explanation: "The explicit budget is not followed.",
  },
  {
    id: "q6",
    type: "mcq",
    category: "instruction_following",
    prompt: "Prompt: 'Give three tips. Do not mention social media.' Which is a hard constraint?",
    options: [
      { id: "A", label: "Friendly tone" },
      { id: "B", label: "Exactly three tips and no social media" },
      { id: "C", label: "Use advanced vocabulary" },
      { id: "D", label: "Add a conclusion" },
    ],
    correct: "B",
    explanation: "Those requirements are explicit.",
  },
  {
    id: "q7",
    type: "mcq",
    category: "instruction_following",
    prompt: "Which workflow best reduces missed constraints?",
    options: [
      { id: "A", label: "Read only the answer" },
      { id: "B", label: "Turn the prompt into a checklist" },
      { id: "C", label: "Prefer longer answers" },
      { id: "D", label: "Focus on grammar first" },
    ],
    correct: "B",
    explanation: "Checklist decomposition helps evaluate every requirement.",
  },
  {
    id: "q8",
    type: "mcq",
    category: "instruction_following",
    prompt: "Prompt: 'Use a table with two columns.' The response gives the correct information as a paragraph. What issue is clearest?",
    options: [
      { id: "A", label: "Formatting/instruction following" },
      { id: "B", label: "Factuality" },
      { id: "C", label: "Relevance" },
      { id: "D", label: "Safety" },
    ],
    correct: "A",
    explanation: "The required format was not used.",
  },
  {
    id: "q9",
    type: "mcq",
    category: "instruction_following",
    prompt: "Prompt: 'Answer in Spanish.' The response is in English. What should the evaluator note?",
    options: [
      { id: "A", label: "A language requirement violation" },
      { id: "B", label: "A factuality issue" },
      { id: "C", label: "A citation issue" },
      { id: "D", label: "No issue" },
    ],
    correct: "A",
    explanation: "The response ignores an explicit language constraint.",
  },
  {
    id: "q10",
    type: "mcq",
    category: "instruction_following",
    prompt: "Prompt: 'Give one advantage and one disadvantage.' The response gives four advantages. What's missing?",
    options: [
      { id: "A", label: "A title" },
      { id: "B", label: "A disadvantage" },
      { id: "C", label: "A citation" },
      { id: "D", label: "A greeting" },
    ],
    correct: "B",
    explanation: "Half the requested comparison is missing.",
  },
  {
    id: "q11",
    type: "mcq",
    category: "response_evaluation",
    prompt: "Which dimension asks whether the answer stays focused on the user's request?",
    options: [
      { id: "A", label: "Relevance" },
      { id: "B", label: "Creativity" },
      { id: "C", label: "Length" },
      { id: "D", label: "Formatting" },
    ],
    correct: "A",
    explanation: "Relevance measures focus on the requested task.",
  },
  {
    id: "q12",
    type: "mcq",
    category: "response_evaluation",
    prompt: "An answer is accurate but addresses only one of two requested questions. What is the clearest weakness?",
    options: [
      { id: "A", label: "Completeness" },
      { id: "B", label: "Spelling" },
      { id: "C", label: "Politeness" },
      { id: "D", label: "Originality" },
    ],
    correct: "A",
    explanation: "It does not answer all requested parts.",
  },
  {
    id: "q13",
    type: "mcq",
    category: "response_evaluation",
    prompt: "Which statement is most accurate?",
    options: [
      { id: "A", label: "Longer answers are always better" },
      { id: "B", label: "Polished language guarantees quality" },
      { id: "C", label: "Quality depends on the rubric and request" },
      { id: "D", label: "The shortest answer always wins" },
    ],
    correct: "C",
    explanation: "Evaluation is criterion-based.",
  },
  {
    id: "q14",
    type: "yesno",
    category: "response_evaluation",
    prompt: "A response contains ten correct facts but never answers the user's question. Should it score strongly overall?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "no",
    explanation: "Correct facts are not useful if they are irrelevant.",
  },
  {
    id: "q15",
    type: "mcq",
    category: "response_evaluation",
    prompt: "Response A has one major factual error. Response B has two minor style issues. Which principle matters?",
    options: [
      { id: "A", label: "Raw issue count only" },
      { id: "B", label: "Issue severity" },
      { id: "C", label: "Word count" },
      { id: "D", label: "Alphabetical order" },
    ],
    correct: "B",
    explanation: "Major errors can outweigh several minor ones.",
  },
  {
    id: "q16",
    type: "mcq",
    category: "response_evaluation",
    prompt: "If two answers satisfy the rubric equally and ties are allowed, what should you do?",
    options: [
      { id: "A", label: "Invent a difference" },
      { id: "B", label: "Choose the longer one" },
      { id: "C", label: "Use a tie" },
      { id: "D", label: "Choose randomly" },
    ],
    correct: "C",
    explanation: "Do not invent distinctions.",
  },
  {
    id: "q17",
    type: "mcq",
    category: "response_evaluation",
    prompt: "A response is clear and concise but gives outdated information to a current-information question. Which issue is strongest?",
    options: [
      { id: "A", label: "Accuracy/currentness" },
      { id: "B", label: "Tone" },
      { id: "C", label: "Formatting" },
      { id: "D", label: "Creativity" },
    ],
    correct: "A",
    explanation: "The answer is not current enough for the request.",
  },
  {
    id: "q18",
    type: "mcq",
    category: "response_evaluation",
    prompt: "Which is the better evaluation habit?",
    options: [
      { id: "A", label: "Judge overall vibe first" },
      { id: "B", label: "Evaluate each response independently before comparing" },
      { id: "C", label: "Always prefer Response A" },
      { id: "D", label: "Always choose the concise answer" },
    ],
    correct: "B",
    explanation: "Independent evaluation reduces anchoring.",
  },
  {
    id: "q19",
    type: "mcq",
    category: "response_evaluation",
    prompt: "A user asks for beginner-friendly instructions. The answer is correct but full of unexplained jargon. Which quality is reduced?",
    options: [
      { id: "A", label: "Clarity" },
      { id: "B", label: "Factuality" },
      { id: "C", label: "Availability" },
      { id: "D", label: "Citation count" },
    ],
    correct: "A",
    explanation: "The audience cannot easily understand it.",
  },
  {
    id: "q20",
    type: "mcq",
    category: "response_evaluation",
    prompt: "A user asks for a neutral comparison, but the response insults one option. Which issue is clearest?",
    options: [
      { id: "A", label: "Tone/objectivity" },
      { id: "B", label: "Word count" },
      { id: "C", label: "Spelling" },
      { id: "D", label: "Formatting" },
    ],
    correct: "A",
    explanation: "The requested neutrality is violated.",
  },
  {
    id: "q21",
    type: "mcq",
    category: "factuality",
    prompt: "Which is primarily an opinion?",
    options: [
      { id: "A", label: "Paris is in France." },
      { id: "B", label: "Water freezes near 0°C at standard pressure." },
      { id: "C", label: "Summer is the best season." },
      { id: "D", label: "Earth orbits the Sun." },
    ],
    correct: "C",
    explanation: "'Best' is subjective.",
  },
  {
    id: "q22",
    type: "mcq",
    category: "factuality",
    prompt: "An AI provides a precise current statistic without support. If research is allowed, what is the best action?",
    options: [
      { id: "A", label: "Assume it is correct" },
      { id: "B", label: "Verify with an appropriate reliable source" },
      { id: "C", label: "Reject all statistics" },
      { id: "D", label: "Ignore it" },
    ],
    correct: "B",
    explanation: "Precise current claims should be checked.",
  },
  {
    id: "q23",
    type: "mcq",
    category: "factuality",
    prompt: "A quotation attributed to a researcher cannot be found in reliable sources. What is a reasonable concern?",
    options: [
      { id: "A", label: "Potential fabrication or misattribution" },
      { id: "B", label: "The quote must be true" },
      { id: "C", label: "The answer is too short" },
      { id: "D", label: "No concern" },
    ],
    correct: "A",
    explanation: "AI can fabricate or misattribute quotes.",
  },
  {
    id: "q24",
    type: "mcq",
    category: "factuality",
    prompt: "Which source is generally strongest for a current government requirement?",
    options: [
      { id: "A", label: "Random forum comment" },
      { id: "B", label: "Official government source" },
      { id: "C", label: "Old marketing blog" },
      { id: "D", label: "Anonymous social post" },
    ],
    correct: "B",
    explanation: "Primary authoritative sources are preferable.",
  },
  {
    id: "q25",
    type: "mcq",
    category: "factuality",
    prompt: "A response says 'this investment cannot lose money.' What issue stands out?",
    options: [
      { id: "A", label: "Overconfidence and unsupported guarantee" },
      { id: "B", label: "Grammar" },
      { id: "C", label: "Formatting" },
      { id: "D", label: "Length" },
    ],
    correct: "A",
    explanation: "Financial outcomes cannot be guaranteed that way.",
  },
  {
    id: "q26",
    type: "mcq",
    category: "factuality",
    prompt: "Which claim most clearly needs verification?",
    options: [
      { id: "A", label: "I enjoy coffee." },
      { id: "B", label: "The company has exactly 18,432 employees today." },
      { id: "C", label: "Blue feels calming to me." },
      { id: "D", label: "This interface looks clean." },
    ],
    correct: "B",
    explanation: "It is precise, factual, and current.",
  },
  {
    id: "q27",
    type: "mcq",
    category: "factuality",
    prompt: "What is calibration?",
    options: [
      { id: "A", label: "Making every answer longer" },
      { id: "B", label: "Matching confidence to available evidence" },
      { id: "C", label: "Always using citations" },
      { id: "D", label: "Avoiding all conclusions" },
    ],
    correct: "B",
    explanation: "Calibration means expressing confidence proportionally to evidence.",
  },
  {
    id: "q28",
    type: "yesno",
    category: "factuality",
    prompt: "A response mixes one correct statement with one false statement. Can it still have a factuality problem?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
    explanation: "Partial correctness does not remove the false claim.",
  },
  {
    id: "q29",
    type: "mcq",
    category: "factuality",
    prompt: "When reliable sources disagree, which is usually better?",
    options: [
      { id: "A", label: "Invent certainty" },
      { id: "B", label: "Acknowledge uncertainty and explain the evidence" },
      { id: "C", label: "Pick the first result" },
      { id: "D", label: "Ignore the conflict" },
    ],
    correct: "B",
    explanation: "Uncertainty should be represented honestly.",
  },
  {
    id: "q30",
    type: "mcq",
    category: "factuality",
    prompt: "Which topic generally deserves extra verification care?",
    options: [
      { id: "A", label: "Medical treatment advice" },
      { id: "B", label: "Favorite color" },
      { id: "C", label: "A fictional character preference" },
      { id: "D", label: "A casual joke" },
    ],
    correct: "A",
    explanation: "Medical claims are high-stakes.",
  },
  {
    id: "q31",
    type: "compare",
    category: "written_reasoning",
    prompt: "Which feedback is stronger?",
    options: [
      { id: "A", label: "B is bad." },
      { id: "B", label: "Response B misses the user's second question, so the answer is incomplete." },
    ],
    correct: "B",
    explanation: "It identifies evidence and impact.",
  },
  {
    id: "q32",
    type: "compare",
    category: "written_reasoning",
    prompt: "Which best follows Decision → Evidence → Impact?",
    options: [
      { id: "A", label: "A wins." },
      { id: "B", label: "A is stronger because it follows the two-item limit, while B gives four items; therefore A better satisfies the prompt." },
    ],
    correct: "B",
    explanation: "It states a decision, evidence, and why it matters.",
  },
  {
    id: "q33",
    type: "compare",
    category: "written_reasoning",
    prompt: "Which wording is more neutral?",
    options: [
      { id: "A", label: "This answer is ridiculous." },
      { id: "B", label: "The response contains a factual error." },
    ],
    correct: "B",
    explanation: "Neutral language is more professional.",
  },
  {
    id: "q34",
    type: "mcq",
    category: "written_reasoning",
    prompt: "A good justification should primarily reference:",
    options: [
      { id: "A", label: "Personal taste" },
      { id: "B", label: "Observable rubric-relevant evidence" },
      { id: "C", label: "The evaluator's mood" },
      { id: "D", label: "Which response is longer" },
    ],
    correct: "B",
    explanation: "Justifications should be evidence-based.",
  },
  {
    id: "q35",
    type: "compare",
    category: "written_reasoning",
    prompt: "Which is too vague to be useful feedback?",
    options: [
      { id: "A", label: "The response omits the requested price comparison." },
      { id: "B", label: "This feels off." },
    ],
    correct: "B",
    explanation: "It does not identify a specific issue.",
  },
  {
    id: "q36",
    type: "mcq",
    category: "written_reasoning",
    prompt: "If the main problem is a budget violation, what should the explanation focus on?",
    options: [
      { id: "A", label: "Every grammar choice" },
      { id: "B", label: "The price exceeding the user's limit" },
      { id: "C", label: "The brand logo" },
      { id: "D", label: "The answer's font" },
    ],
    correct: "B",
    explanation: "Focus on the highest-impact criterion.",
  },
  {
    id: "q37",
    type: "compare",
    category: "written_reasoning",
    prompt: "Which is a stronger justification for a child-friendly answer?",
    options: [
      { id: "A", label: "B sounds nicer." },
      { id: "B", label: "B uses simple language appropriate for the requested age, while A relies on technical terminology." },
    ],
    correct: "B",
    explanation: "It ties evidence to the audience requirement.",
  },
  {
    id: "q38",
    type: "compare",
    category: "written_reasoning",
    prompt: "Should a justification list every tiny issue when one major issue decides the ranking?",
    options: [
      { id: "A", label: "Usually no; focus on decisive evidence" },
      { id: "B", label: "Always yes" },
    ],
    correct: "A",
    explanation: "Concise decisive evidence is often stronger.",
  },
  {
    id: "q39",
    type: "compare",
    category: "written_reasoning",
    prompt: "Which statement is an evaluation rather than an insult?",
    options: [
      { id: "A", label: "Only an idiot would write this." },
      { id: "B", label: "The answer does not follow the requested format." },
    ],
    correct: "B",
    explanation: "Professional evaluation describes the issue.",
  },
  {
    id: "q40",
    type: "mcq",
    category: "written_reasoning",
    prompt: "What should personal style preference do when the rubric does not mention it?",
    options: [
      { id: "A", label: "Override the rubric" },
      { id: "B", label: "Remain secondary" },
      { id: "C", label: "Automatically fail the answer" },
      { id: "D", label: "Determine the score" },
    ],
    correct: "B",
    explanation: "Rubric criteria should control.",
  },
  {
    id: "q41",
    type: "mcq",
    category: "attention_to_detail",
    prompt: "Prompt: 'List Sacramento, San Diego, and Los Angeles alphabetically.' Which order is correct?",
    options: [
      { id: "A", label: "San Diego, Los Angeles, Sacramento" },
      { id: "B", label: "Los Angeles, Sacramento, San Diego" },
      { id: "C", label: "Sacramento, Los Angeles, San Diego" },
      { id: "D", label: "Los Angeles, San Diego, Sacramento" },
    ],
    correct: "B",
    explanation: "Alphabetical order is Los Angeles, Sacramento, San Diego.",
  },
  {
    id: "q42",
    type: "yesno",
    category: "attention_to_detail",
    prompt: "Prompt: 'Give exactly two examples, each one sentence.' The answer contains two examples, but the second is two sentences. Is there a violation?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
    explanation: "Each example was required to be one sentence.",
  },
  {
    id: "q43",
    type: "mcq",
    category: "attention_to_detail",
    prompt: "Prompt: 'Do not mention museums.' Which recommendation violates the instruction?",
    options: [
      { id: "A", label: "Walk through Central Park" },
      { id: "B", label: "Visit the Metropolitan Museum of Art" },
      { id: "C", label: "Use a public library" },
      { id: "D", label: "Walk the High Line" },
    ],
    correct: "B",
    explanation: "The Metropolitan Museum is a museum.",
  },
  {
    id: "q44",
    type: "yesno",
    category: "attention_to_detail",
    prompt: "Prompt: 'Use no more than 30 words.' The response contains 31 words. Is the hard limit exceeded?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "yes",
    explanation: "A maximum of 30 means 31 violates the constraint.",
  },
  {
    id: "q45",
    type: "mcq",
    category: "attention_to_detail",
    prompt: "Which habit best catches subtle constraint errors?",
    options: [
      { id: "A", label: "Skim once" },
      { id: "B", label: "Use a requirement checklist before finalizing" },
      { id: "C", label: "Choose by tone only" },
      { id: "D", label: "Ignore exact numbers" },
    ],
    correct: "B",
    explanation: "A checklist helps catch small violations.",
  },
  {
    id: "q46",
    type: "mcq",
    category: "attention_to_detail",
    prompt: "Prompt: 'Give three free activities.' One recommendation requires a paid ticket. What is the issue?",
    options: [
      { id: "A", label: "The free-cost constraint is violated" },
      { id: "B", label: "The answer is too formal" },
      { id: "C", label: "The response needs a title" },
      { id: "D", label: "No issue" },
    ],
    correct: "A",
    explanation: "The activity is not free.",
  },
  {
    id: "q47",
    type: "yesno",
    category: "attention_to_detail",
    prompt: "Prompt: 'Reply with only Yes or No.' Response: 'Yes, absolutely.' Is it fully compliant?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    correct: "no",
    explanation: "The prompt requires only the word Yes or No.",
  },
  {
    id: "q48",
    type: "mcq",
    category: "attention_to_detail",
    prompt: "Prompt: 'Use lowercase only.' Response contains one capitalized word. What is the correct observation?",
    options: [
      { id: "A", label: "A formatting constraint was violated" },
      { id: "B", label: "No issue" },
      { id: "C", label: "A factuality issue" },
      { id: "D", label: "A safety issue" },
    ],
    correct: "A",
    explanation: "Even a single capital letter violates a strict lowercase-only requirement.",
  },
  {
    id: "constraint-detective-01",
    type: "compare",
    category: "instruction_following",
    helper: "Practical task",
    stimulus: "Prompt: Recommend exactly three inexpensive activities for a rainy day at home. Keep the entire response under 50 words.",
    prompt: "Which response better matches the prompt?",
    options: [
      { id: "A", label: "Read a book, try a simple home workout, or cook something using ingredients you already have." },
      { id: "B", label: "Read, watch movies, cook, exercise, drive somewhere, visit friends, play games, or start a new hobby." },
    ],
    correct: "A",
    explanation: "A satisfies the count, context, and concision requirements.",
  },
  {
    id: "ranking-01",
    type: "compare",
    category: "response_evaluation",
    helper: "Practical task",
    stimulus: "Prompt: Explain why the sky appears blue in two beginner-friendly sentences.",
    prompt: "Which response better matches the prompt?",
    options: [
      { id: "A", label: "The atmosphere scatters shorter blue wavelengths of sunlight more strongly than many longer wavelengths. That scattered blue light reaches our eyes from many directions." },
      { id: "B", label: "Rayleigh scattering results from wavelength-dependent electromagnetic interactions within gaseous molecular media, creating a spectral angular redistribution." },
    ],
    correct: "A",
    explanation: "A is more appropriate for the requested audience and stays within two sentences.",
  },
  {
    id: "hallucination-01",
    type: "mcq",
    category: "factuality",
    helper: "Practical task",
    prompt: "Evaluate this claim: 'The company launched its newest product yesterday and sold exactly 2.4 million units in the first six hours.'",
    options: [
      { id: "A", label: "Flag for verification" },
      { id: "B", label: "Approve as written" },
    ],
    correct: "A",
    explanation: "Highly precise current claims deserve verification.",
  },
  {
    id: "tone-01",
    type: "compare",
    category: "response_evaluation",
    helper: "Practical task",
    stimulus: "Prompt: Write a professional, friendly one-sentence message declining tomorrow's meeting.",
    prompt: "Which response better matches the prompt?",
    options: [
      { id: "A", label: "Can't make it." },
      { id: "B", label: "Thank you for the invitation, but unfortunately I won't be available for tomorrow's meeting." },
    ],
    correct: "B",
    explanation: "B satisfies the tone and communication requirements.",
  },
  {
    id: "evidence-01",
    type: "compare",
    category: "factuality",
    helper: "Practical task",
    stimulus: "Prompt: Which source would you prefer for checking the current eligibility age for a U.S. federal program?",
    prompt: "Which response better matches the prompt?",
    options: [
      { id: "A", label: "A five-year-old forum comment" },
      { id: "B", label: "The program's current official government page" },
    ],
    correct: "B",
    explanation: "A current primary government source is generally stronger.",
  },
  {
    id: "justification-01",
    type: "written",
    category: "written_reasoning",
    helper: "Practical task",
    prompt: "User asks for two pros and two cons. Response A gives two pros and two cons. Response B gives four pros and no cons. Write a 2-sentence justification. Write two sentences using Decision → Evidence → Impact.",
    placeholder: "Decision, evidence, impact…",
    keywords: ["both", "categories", "conclusion", "disadvantages", "following", "instruction", "omits", "requested", "satisfies", "stronger"],
    explanation: "Response A is stronger because it provides both two advantages and two disadvantages as requested. Response B gives only advantages, so it does not complete the full task.",
  },
  {
    id: "multi-constraint-01",
    type: "compare",
    category: "attention_to_detail",
    helper: "Practical task",
    stimulus: "Prompt: Give exactly two free outdoor activities in Chicago. Use bullet points. Each item must be five words or fewer. Do not mention parks.",
    prompt: "Which response better matches the prompt?",
    options: [
      { id: "A", label: "- Walk the Lakefront Trail\n- Explore public street art" },
      { id: "B", label: "- Visit Millennium Park for free\n- Walk the Lakefront Trail today" },
    ],
    correct: "A",
    explanation: "A meets the explicit constraints.",
  },
  {
    id: "mixed-01",
    type: "mcq",
    category: "response_evaluation",
    helper: "Practical task",
    prompt: "A user asks for a neutral, 3-bullet summary of two competing proposals. Response A gives three balanced bullets. Response B gives three bullets but calls one proposal 'obviously ridiculous.' Which is better and why?",
    options: [
      { id: "A", label: "Response A is stronger" },
      { id: "B", label: "Response B is stronger" },
    ],
    correct: "A",
    explanation: "A better follows the neutrality requirement.",
  },
];

const CORE_IDS = ASSESSMENT_QUESTIONS.filter((item) => item.id.startsWith('q')).map((item) => item.id);
const PRACTICAL_IDS = ASSESSMENT_QUESTIONS.filter((item) => !item.id.startsWith('q')).map((item) => item.id);

function shuffle<T>(values: T[]): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i];
    const b = next[j];
    if (a === undefined || b === undefined) continue;
    next[i] = b;
    next[j] = a;
  }
  return next;
}

export function selectAttemptQuestionIds(): string[] {
  const chosen: string[] = [];
  (Object.keys(CATEGORY_TARGETS) as ScoreCategory[]).forEach((category) => {
    const pool = ASSESSMENT_QUESTIONS.filter(
      (item) => item.category === category && item.id.startsWith('q'),
    ).map((item) => item.id);
    chosen.push(...shuffle(pool).slice(0, CATEGORY_TARGETS[category]));
  });
  chosen.push(...shuffle(PRACTICAL_IDS).slice(0, ATTEMPT_PRACTICAL_COUNT));
  return chosen;
}

export function questionsForIds(ids: string[]): PublicQuestion[] {
  const map = new Map(ASSESSMENT_QUESTIONS.map((item) => [item.id, item]));
  return ids
    .map((id) => map.get(id))
    .filter((item): item is ScoredQuestion => Boolean(item))
    .map(({ category: _c, correct: _k, keywords: _w, explanation: _e, ...rest }) => rest);
}

export function publicQuestions(): PublicQuestion[] {
  return questionsForIds(CORE_IDS);
}

export function questionById(id: string) {
  return ASSESSMENT_QUESTIONS.find((item) => item.id === id);
}
