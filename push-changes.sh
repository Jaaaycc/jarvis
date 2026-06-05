#!/bin/bash
# A simple script to commit and push changes
cd /data/your_repo || exit
git add .
git commit -m "$1"
git push