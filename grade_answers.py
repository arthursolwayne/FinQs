#!/usr/bin/env python3
"""
Grade financial research answers against ground truth rubrics.
"""

import json
import csv
import re
from collections import defaultdict
from typing import Dict, List, Any

def load_ground_truth(csv_path: str) -> Dict[int, Dict[str, Any]]:
    """Load ground truth from public.csv"""
    ground_truth = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        question_num = 1
        for row in reader:
            if row['Question']:  # Skip empty rows
                # Parse rubric JSON
                rubric = eval(row['Rubric'])  # Safe since we control the source
                ground_truth[question_num] = {
                    'question': row['Question'],
                    'answer': row['Answer'],
                    'question_type': row['Question Type'],
                    'expert_time': int(row['Expert time (mins)']),
                    'rubric': rubric
                }
                question_num += 1
    return ground_truth

def load_answers(json_path: str) -> Dict[int, Dict[str, Any]]:
    """Load answers from answers.json"""
    with open(json_path, 'r', encoding='utf-8') as f:
        answers_list = json.load(f)

    answers = {}
    for item in answers_list:
        answers[item['question_number']] = {
            'question': item['question'],
            'answer': item.get('answer', ''),
            'sources': item.get('sources', [])
        }
    return answers

def categorize_difficulty(question_type: str, expert_time: int) -> str:
    """Categorize difficulty based on question type and expert time"""
    if expert_time <= 5:
        return "Easy"
    elif expert_time <= 15:
        return "Medium"
    elif expert_time <= 30:
        return "Hard"
    else:
        return "Very Hard"

def check_criterion(criterion_text: str, answer: str, ground_truth: str) -> tuple[bool, str]:
    """
    Check if a criterion is met in the answer.
    Returns (is_met, evidence/reason)
    """
    if not answer or answer.strip() == "":
        return False, "No answer provided"

    # Normalize text for comparison
    answer_lower = answer.lower()
    criterion_lower = criterion_text.lower()

    # Remove common prefixes like "FINAL ANSWER:"
    answer_clean = re.sub(r'^final answer:\s*', '', answer_lower, flags=re.IGNORECASE)

    # Check for key numbers and facts
    # Extract numbers from criterion
    numbers = re.findall(r'[\d,]+\.?\d*%?', criterion_text)

    if numbers:
        # Check if numbers are in the answer
        all_found = all(num.replace(',', '') in answer_clean.replace(',', '') for num in numbers)
        if all_found:
            return True, f"Found required numbers: {', '.join(numbers)}"

    # Check for key phrases (split by common delimiters)
    key_phrases = [p.strip() for p in re.split(r'[:\n]', criterion_text) if p.strip()]

    # Check if main concepts are present
    matches = 0
    total = len(key_phrases)

    for phrase in key_phrases:
        # Extract key words (ignore common words)
        words = [w for w in phrase.lower().split() if len(w) > 3 and w not in
                ['the', 'and', 'for', 'that', 'this', 'with', 'from', 'were', 'have', 'has', 'was']]

        if words:
            # Check if at least 50% of key words are in answer
            found_words = sum(1 for w in words if w in answer_lower)
            if found_words >= len(words) * 0.5:
                matches += 1

    if total > 0 and matches / total >= 0.6:
        return True, f"Found {matches}/{total} key concepts from criterion"

    # Check for semantic similarity (simple substring matching)
    if len(criterion_text) < 100:
        # For short criteria, check direct substring match (allowing for minor variations)
        criterion_words = set(w.lower() for w in re.findall(r'\b\w+\b', criterion_text) if len(w) > 3)
        answer_words = set(w.lower() for w in re.findall(r'\b\w+\b', answer) if len(w) > 3)

        if criterion_words:
            overlap = len(criterion_words & answer_words) / len(criterion_words)
            if overlap >= 0.6:
                return True, f"Strong word overlap ({overlap:.0%}) with criterion"

    return False, "Criterion not clearly met in answer"

def grade_answer(question_num: int, answer_data: Dict, ground_truth_data: Dict) -> Dict[str, Any]:
    """Grade a single answer against ground truth rubrics"""

    answer_text = answer_data.get('answer', '')
    sources = answer_data.get('sources', [])
    rubric = ground_truth_data['rubric']

    # Determine status
    if not answer_text or answer_text.strip() == "":
        status = "Skipped"
    elif "FINAL ANSWER:" in answer_text:
        status = "Answered"
    else:
        status = "Attempted"

    # Grade correctness
    correctness_criteria = [r for r in rubric if r['operator'] == 'correctness']
    contradiction_criteria = [r for r in rubric if r['operator'] == 'contradiction']

    rubric_results = []
    met_count = 0

    # Check correctness criteria
    for criterion in correctness_criteria:
        is_met, evidence = check_criterion(
            criterion['criteria'],
            answer_text,
            ground_truth_data['answer']
        )

        rubric_results.append({
            'type': 'correctness',
            'criteria': criterion['criteria'],
            'met': is_met,
            'evidence': evidence
        })

        if is_met:
            met_count += 1

    # Calculate correctness score
    if len(correctness_criteria) > 0:
        correctness_score = (met_count / len(correctness_criteria)) * 100
    else:
        correctness_score = 0 if status == "Skipped" else 50

    # Check for contradictions
    has_contradictions = False
    for criterion in contradiction_criteria:
        # Contradiction check is more lenient - we check if answer contradicts ground truth
        # For now, we'll mark as no contradiction unless we find clear opposite statements
        is_met, evidence = check_criterion(
            criterion['criteria'],
            answer_text,
            ground_truth_data['answer']
        )

        rubric_results.append({
            'type': 'contradiction',
            'criteria': criterion['criteria'],
            'met': is_met,
            'evidence': evidence
        })

        # If the answer doesn't match the ground truth well, it might be a contradiction
        if not is_met and status == "Answered":
            has_contradictions = True

    # Penalize for contradictions
    if has_contradictions and correctness_score < 30:
        correctness_score = max(0, correctness_score - 20)

    # Grade sources quality
    if not sources or len(sources) == 0:
        sources_quality = "Poor"
    elif len(sources) >= 2 and any('sec.gov' in s.get('url', '').lower() or
                                     'investor' in s.get('url', '').lower() or
                                     'ir.' in s.get('url', '').lower() for s in sources):
        sources_quality = "Good"
    elif len(sources) >= 1:
        sources_quality = "Acceptable"
    else:
        sources_quality = "Poor"

    # Adjust score based on status
    if status == "Skipped":
        final_score = 0
        comments = "Question was skipped - no answer provided"
    elif status == "Attempted":
        final_score = correctness_score * 0.5  # Partial credit for attempts
        comments = f"Answer was attempted but may not be complete. Met {met_count}/{len(correctness_criteria)} rubric criteria."
    else:  # Answered
        final_score = correctness_score
        if has_contradictions:
            comments = f"Answer provided but has contradictions. Met {met_count}/{len(correctness_criteria)} rubric criteria. Sources: {sources_quality}."
        else:
            comments = f"Answer provided. Met {met_count}/{len(correctness_criteria)} rubric criteria. Sources: {sources_quality}."

    difficulty = categorize_difficulty(ground_truth_data['question_type'], ground_truth_data['expert_time'])

    return {
        'question_num': question_num,
        'question_type': ground_truth_data['question_type'],
        'difficulty': difficulty,
        'expert_time_mins': ground_truth_data['expert_time'],
        'status': status,
        'correctness_score': round(correctness_score, 1),
        'has_contradictions': has_contradictions,
        'sources_quality': sources_quality,
        'rubric_results': rubric_results,
        'final_score': round(final_score, 1),
        'comments': comments
    }

def calculate_summary(graded_results: List[Dict]) -> Dict[str, Any]:
    """Calculate summary statistics"""
    total = len(graded_results)
    answered = sum(1 for r in graded_results if r['status'] == 'Answered')
    attempted = sum(1 for r in graded_results if r['status'] == 'Attempted')
    skipped = sum(1 for r in graded_results if r['status'] == 'Skipped')

    avg_score = sum(r['final_score'] for r in graded_results) / total if total > 0 else 0

    # By difficulty
    by_difficulty = defaultdict(list)
    for r in graded_results:
        by_difficulty[r['difficulty']].append(r['final_score'])

    difficulty_stats = {
        diff: round(sum(scores) / len(scores), 1) if scores else 0
        for diff, scores in by_difficulty.items()
    }

    # By question type
    by_type = defaultdict(list)
    for r in graded_results:
        by_type[r['question_type']].append(r['final_score'])

    type_stats = {
        qtype: round(sum(scores) / len(scores), 1) if scores else 0
        for qtype, scores in by_type.items()
    }

    return {
        'total_questions': total,
        'answered': answered,
        'attempted': attempted,
        'skipped': skipped,
        'average_score': round(avg_score, 1),
        'by_difficulty': difficulty_stats,
        'by_question_type': type_stats
    }

def main():
    print("Loading ground truth...")
    ground_truth = load_ground_truth('/tmp/public.csv')
    print(f"Loaded {len(ground_truth)} questions from ground truth")

    print("\nLoading answers...")
    answers = load_answers('/tmp/answers.json')
    print(f"Loaded {len(answers)} answers")

    print("\nGrading answers...")
    graded_results = []

    for q_num in range(1, 51):  # Questions 1-50
        if q_num in ground_truth:
            answer_data = answers.get(q_num, {'answer': '', 'sources': []})
            result = grade_answer(q_num, answer_data, ground_truth[q_num])
            graded_results.append(result)
            print(f"Q{q_num}: {result['status']} - Score: {result['final_score']}/100")

    print("\nCalculating summary statistics...")
    summary = calculate_summary(graded_results)

    # Save results
    output = {
        'questions': graded_results,
        'summary': summary
    }

    print("\nSaving results to grading_results.json...")
    with open('/home/user/FinQs/grading_results.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("\n" + "="*80)
    print("GRADING COMPLETE")
    print("="*80)
    print(f"\nTotal Questions: {summary['total_questions']}")
    print(f"Answered: {summary['answered']}")
    print(f"Attempted: {summary['attempted']}")
    print(f"Skipped: {summary['skipped']}")
    print(f"Average Score: {summary['average_score']}/100")
    print(f"\nBy Difficulty:")
    for diff, score in sorted(summary['by_difficulty'].items()):
        print(f"  {diff}: {score}/100")
    print(f"\nBy Question Type:")
    for qtype, score in sorted(summary['by_question_type'].items()):
        print(f"  {qtype}: {score}/100")

if __name__ == '__main__':
    main()
