#!/usr/bin/env python3
"""
Helper script to track completed questions
"""
completed = list(range(1, 8))  # Q1-Q7 done
total = 50
remaining = total - len(completed)
print(f"Completed: {len(completed)}/{total}")
print(f"Remaining: {remaining}")
print(f"Progress: {len(completed)/total*100:.1f}%")
