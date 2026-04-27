#!/bin/bash
# apply_pr.sh - Applies a GitHub PR as a patch to the current branch
set -e

PR_NUMBER=$1
if [ -z "$PR_NUMBER" ]; then
  echo "Usage: $0 <pr_number>"
  exit 1
fi

echo "Fetching patch for PR #$PR_NUMBER..."
# Use gh pr diff to get the patch and apply it
gh pr diff "$PR_NUMBER" | git apply --3way -

echo "Successfully applied PR #$PR_NUMBER"
