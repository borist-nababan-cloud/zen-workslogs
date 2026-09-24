echo "# karunialogsapp" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/borist-nababan-cloud/karunialogsapp.git
git push -u origin main

Create commit message, commit and push to GitHub repository, remember, DO NOT PUSH any sensitive data such env file, *.sql file, *md files that contain sensitive data. Add those file to gitignore. Also add `docs`, `my-cred`, `database-docs` directory with all files inside to gitignore. 
