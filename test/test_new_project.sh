#!/bin/bash
set -ex

# remove temporary blank project
rm  -rf tmp-project

# test generating new project in cwd
mkdir tmp-project
cd tmp-project
../bin/near new_project
yarn
yarn remove near-shell
yarn add ../
yarn test
cd ..

# test generating new project in new dir
rm  -rf tmp-project
./bin/near new_project 'tmp-project'
cd tmp-project
FILE=package.json
if test -f "$FILE"; then
  echo "$FILE exists. Have a cookie!"
else
  echo "ERROR: $FILE not found."
  exit 1
fi
