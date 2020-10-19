#!/bin/sh

USER="your_user_name"
MACHINE="any_CSE_Labs_Linux_machine"
DIRECTORY=".www/Lecture-12/"

rm -rf dist/assets
cp -r assets dist/assets
rsync -avr --delete --chmod=D701,F644 dist/ "$USER"@"$MACHINE":"$DIRECTORY"