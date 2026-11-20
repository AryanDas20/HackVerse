'use strict';

// A deterministic, explainable skill catalogue. Aliases are intentionally explicit so
// common spellings (for example ReactJS and React.js) resolve to one canonical skill.
const SKILLS = [
  { key: 'javascript', name: 'JavaScript', category: 'Programming', aliases: ['javascript', 'js', 'ecmascript', 'es6', 'es2015'], resource: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
  { key: 'typescript', name: 'TypeScript', category: 'Programming', aliases: ['typescript', 'ts'], resource: 'https://www.typescriptlang.org/docs/' },
  { key: 'python', name: 'Python', category: 'Programming', aliases: ['python', 'python3'], resource: 'https://docs.python.org/3/tutorial/' },
  { key: 'java', name: 'Java', category: 'Programming', aliases: ['java'], resource: 'https://dev.java/learn/' },
  { key: 'cpp', name: 'C++', category: 'Programming', aliases: ['c++', 'cpp'], resource: 'https://www.learncpp.com/' },
  { key: 'csharp', name: 'C#', category: 'Programming', aliases: ['c#', 'c sharp', 'csharp'], resource: 'https://learn.microsoft.com/en-us/dotnet/csharp/' },
  { key: 'go', name: 'Go', category: 'Programming', aliases: ['golang', 'go language'], resource: 'https://go.dev/learn/' },
  { key: 'rust', name: 'Rust', category: 'Programming', aliases: ['rust'], resource: 'https://doc.rust-lang.org/book/' },
  { key: 'kotlin', name: 'Kotlin', category: 'Programming', aliases: ['kotlin'], resource: 'https://kotlinlang.org/docs/getting-started.html' },
  { key: 'swift', name: 'Swift', category: 'Programming', aliases: ['swift'], resource: 'https://www.swift.org/documentation/' },
  { key: 'ruby', name: 'Ruby', category: 'Programming', aliases: ['ruby'], resource: 'https://www.ruby-lang.org/en/documentation/quickstart/' },
  { key: 'scala', name: 'Scala', category: 'Programming', aliases: ['scala'], resource: 'https://docs.scala-lang.org/getting-started/' },
  { key: 'c', name: 'C', category: 'Programming', aliases: ['c programming', 'c language', 'ansi c'], resource: 'https://en.cppreference.com/w/c' },
  { key: 'rprogramming', name: 'R', category: 'Programming', aliases: ['r programming', 'r language'], resource: 'https://www.r-project.org/other-docs.html' },
  { key: 'php', name: 'PHP', category: 'Programming', aliases: ['php'], resource: 'https://www.php.net/manual/en/getting-started.php' },
  { key: 'html', name: 'HTML', category: 'Frontend', aliases: ['html', 'html5'], resource: 'https://developer.mozilla.org/en-US/docs/Learn/HTML' },
  { key: 'css', name: 'CSS', category: 'Frontend', aliases: ['css', 'css3'], resource: 'https://developer.mozilla.org/en-US/docs/Learn/CSS' },
  { key: 'react', name: 'React', category: 'Frontend', aliases: ['react', 'reactjs', 'react.js', 'react js'], resource: 'https://react.dev/learn' },
  { key: 'nextjs', name: 'Next.js', category: 'Frontend', aliases: ['next.js', 'nextjs', 'next js'], resource: 'https://nextjs.org/learn' },
  { key: 'angular', name: 'Angular', category: 'Frontend', aliases: ['angular', 'angularjs'], resource: 'https://angular.dev/tutorials' },
  { key: 'vue', name: 'Vue.js', category: 'Frontend', aliases: ['vue', 'vue.js', 'vuejs'], resource: 'https://vuejs.org/guide/introduction.html' },
  { key: 'redux', name: 'Redux', category: 'Frontend', aliases: ['redux', 'redux toolkit'], resource: 'https://redux.js.org/tutorials/essentials/part-1-overview-concepts' },
  { key: 'tailwind', name: 'Tailwind CSS', category: 'Frontend', aliases: ['tailwind', 'tailwind css'], resource: 'https://tailwindcss.com/docs/installation' },
  { key: 'nodejs', name: 'Node.js', category: 'Backend', aliases: ['node', 'node.js', 'nodejs', 'node js'], resource: 'https://nodejs.org/en/learn' },
  { key: 'express', name: 'Express.js', category: 'Backend', aliases: ['express', 'express.js', 'expressjs'], resource: 'https://expressjs.com/en/starter/installing.html' },
  { key: 'django', name: 'Django', category: 'Backend', aliases: ['django'], resource: 'https://docs.djangoproject.com/en/stable/intro/tutorial01/' },
  { key: 'flask', name: 'Flask', category: 'Backend', aliases: ['flask'], resource: 'https://flask.palletsprojects.com/en/stable/tutorial/' },
  { key: 'fastapi', name: 'FastAPI', category: 'Backend', aliases: ['fastapi', 'fast api'], resource: 'https://fastapi.tiangolo.com/tutorial/' },
  { key: 'springboot', name: 'Spring Boot', category: 'Backend', aliases: ['spring boot', 'springboot'], resource: 'https://spring.io/guides' },
  { key: 'restapi', name: 'REST APIs', category: 'Backend', aliases: ['rest api', 'rest apis', 'restful api', 'restful apis'], resource: 'https://developer.mozilla.org/en-US/docs/Glossary/REST' },
  { key: 'graphql', name: 'GraphQL', category: 'Backend', aliases: ['graphql', 'graph ql'], resource: 'https://graphql.org/learn/' },
  { key: 'microservices', name: 'Microservices', category: 'Backend', aliases: ['microservices', 'microservice architecture'], resource: 'https://microservices.io/' },
  { key: 'systemdesign', name: 'System Design', category: 'Backend', aliases: ['system design', 'distributed systems design'], resource: 'https://github.com/donnemartin/system-design-primer' },
  { key: 'dsa', name: 'Data Structures and Algorithms', category: 'Computer Science', aliases: ['data structures and algorithms', 'data structures', 'algorithms', 'dsa'], resource: 'https://www.geeksforgeeks.org/data-structures/' },
  { key: 'oop', name: 'Object-Oriented Programming', category: 'Computer Science', aliases: ['object oriented programming', 'object-oriented programming', 'oop'], resource: 'https://docs.oracle.com/javase/tutorial/java/concepts/' },
  { key: 'sql', name: 'SQL', category: 'Databases', aliases: ['sql'], resource: 'https://www.postgresql.org/docs/current/tutorial.html' },
  { key: 'postgresql', name: 'PostgreSQL', category: 'Databases', aliases: ['postgres', 'postgresql'], resource: 'https://www.postgresql.org/docs/current/tutorial.html' },
  { key: 'mysql', name: 'MySQL', category: 'Databases', aliases: ['mysql'], resource: 'https://dev.mysql.com/doc/mysql-tutorial-excerpt/8.4/en/' },
  { key: 'mongodb', name: 'MongoDB', category: 'Databases', aliases: ['mongodb', 'mongo db', 'mongo'], resource: 'https://www.mongodb.com/docs/manual/tutorial/' },
  { key: 'redis', name: 'Redis', category: 'Databases', aliases: ['redis'], resource: 'https://redis.io/docs/latest/develop/get-started/' },
  { key: 'firebase', name: 'Firebase', category: 'Cloud & Tools', aliases: ['firebase', 'google firebase'], resource: 'https://firebase.google.com/docs' },
  { key: 'supabase', name: 'Supabase', category: 'Cloud & Tools', aliases: ['supabase'], resource: 'https://supabase.com/docs' },
  { key: 'git', name: 'Git', category: 'Tools', aliases: ['git', 'version control'], resource: 'https://git-scm.com/docs/gittutorial' },
  { key: 'github', name: 'GitHub', category: 'Tools', aliases: ['github', 'github actions'], resource: 'https://docs.github.com/en/get-started' },
  { key: 'docker', name: 'Docker', category: 'Cloud & Tools', aliases: ['docker', 'containerization'], resource: 'https://docs.docker.com/get-started/' },
  { key: 'kubernetes', name: 'Kubernetes', category: 'Cloud & Tools', aliases: ['kubernetes', 'k8s'], resource: 'https://kubernetes.io/docs/tutorials/' },
  { key: 'aws', name: 'AWS', category: 'Cloud & Tools', aliases: ['aws', 'amazon web services'], resource: 'https://skillbuilder.aws/' },
  { key: 'azure', name: 'Microsoft Azure', category: 'Cloud & Tools', aliases: ['azure', 'microsoft azure'], resource: 'https://learn.microsoft.com/en-us/training/azure/' },
  { key: 'gcp', name: 'Google Cloud', category: 'Cloud & Tools', aliases: ['gcp', 'google cloud platform', 'google cloud'], resource: 'https://cloud.google.com/learn/training' },
  { key: 'cloudcomputing', name: 'Cloud Computing', category: 'Cloud & Tools', aliases: ['cloud computing', 'cloud infrastructure'], resource: 'https://cloud.google.com/learn' },
  { key: 'jenkins', name: 'Jenkins', category: 'Tools', aliases: ['jenkins'], resource: 'https://www.jenkins.io/doc/tutorials/' },
  { key: 'terraform', name: 'Terraform', category: 'Cloud & Tools', aliases: ['terraform'], resource: 'https://developer.hashicorp.com/terraform/tutorials' },
  { key: 'gitlab', name: 'GitLab', category: 'Tools', aliases: ['gitlab', 'gitlab ci'], resource: 'https://docs.gitlab.com/tutorials/' },
  { key: 'postman', name: 'Postman', category: 'Tools', aliases: ['postman'], resource: 'https://learning.postman.com/docs/introduction/overview/' },
  { key: 'jira', name: 'Jira', category: 'Tools', aliases: ['jira'], resource: 'https://www.atlassian.com/software/jira/guides' },
  { key: 'kafka', name: 'Apache Kafka', category: 'Data & Streaming', aliases: ['apache kafka', 'kafka'], resource: 'https://kafka.apache.org/quickstart' },
  { key: 'spark', name: 'Apache Spark', category: 'Data & Streaming', aliases: ['apache spark', 'spark sql'], resource: 'https://spark.apache.org/docs/latest/quick-start.html' },
  { key: 'linux', name: 'Linux', category: 'Tools', aliases: ['linux'], resource: 'https://linuxjourney.com/' },
  { key: 'cicd', name: 'CI/CD', category: 'Tools', aliases: ['ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment'], resource: 'https://docs.github.com/en/actions' },
  { key: 'machinelearning', name: 'Machine Learning', category: 'AI & Data', aliases: ['machine learning', 'ml'], resource: 'https://developers.google.com/machine-learning/crash-course' },
  { key: 'deeplearning', name: 'Deep Learning', category: 'AI & Data', aliases: ['deep learning', 'dl'], resource: 'https://www.deeplearning.ai/' },
  { key: 'nlp', name: 'Natural Language Processing', category: 'AI & Data', aliases: ['natural language processing', 'nlp'], resource: 'https://huggingface.co/learn/nlp-course' },
  { key: 'generativeai', name: 'Generative AI', category: 'AI & Data', aliases: ['generative ai', 'gen ai', 'genai', 'large language models', 'llm', 'llms'], resource: 'https://www.deeplearning.ai/short-courses/' },
  { key: 'tensorflow', name: 'TensorFlow', category: 'AI & Data', aliases: ['tensorflow', 'tensor flow'], resource: 'https://www.tensorflow.org/tutorials' },
  { key: 'pytorch', name: 'PyTorch', category: 'AI & Data', aliases: ['pytorch', 'py torch'], resource: 'https://pytorch.org/tutorials/' },
  { key: 'scikitlearn', name: 'scikit-learn', category: 'AI & Data', aliases: ['scikit-learn', 'scikit learn', 'sklearn'], resource: 'https://scikit-learn.org/stable/getting_started.html' },
  { key: 'pandas', name: 'Pandas', category: 'AI & Data', aliases: ['pandas'], resource: 'https://pandas.pydata.org/docs/getting_started/index.html' },
  { key: 'numpy', name: 'NumPy', category: 'AI & Data', aliases: ['numpy'], resource: 'https://numpy.org/learn/' },
  { key: 'powerbi', name: 'Power BI', category: 'Data & Analytics', aliases: ['power bi', 'powerbi'], resource: 'https://learn.microsoft.com/en-us/power-bi/fundamentals/' },
  { key: 'tableau', name: 'Tableau', category: 'Data & Analytics', aliases: ['tableau'], resource: 'https://www.tableau.com/learn/training' },
  { key: 'dataanalysis', name: 'Data Analysis', category: 'Data & Analytics', aliases: ['data analysis', 'data analytics', 'data analyst'], resource: 'https://www.coursera.org/articles/what-is-data-analysis' },
  { key: 'excel', name: 'Microsoft Excel', category: 'Data & Analytics', aliases: ['excel', 'microsoft excel'], resource: 'https://support.microsoft.com/en-us/excel' },
  { key: 'figma', name: 'Figma', category: 'Design', aliases: ['figma'], resource: 'https://help.figma.com/hc/en-us/categories/360002051613-Get-started' },
  { key: 'uiux', name: 'UI/UX Design', category: 'Design', aliases: ['ui/ux', 'ui ux', 'user interface design', 'user experience design'], resource: 'https://www.figma.com/resource-library/' },
  { key: 'jest', name: 'Jest', category: 'Testing', aliases: ['jest'], resource: 'https://jestjs.io/docs/getting-started' },
  { key: 'cypress', name: 'Cypress', category: 'Testing', aliases: ['cypress'], resource: 'https://docs.cypress.io/app/get-started/why-cypress' },
  { key: 'selenium', name: 'Selenium', category: 'Testing', aliases: ['selenium'], resource: 'https://www.selenium.dev/documentation/' },
  { key: 'unittesting', name: 'Unit Testing', category: 'Testing', aliases: ['unit testing', 'unit tests'], resource: 'https://martinfowler.com/articles/practical-test-pyramid.html' },
  { key: 'cybersecurity', name: 'Cybersecurity', category: 'Security', aliases: ['cybersecurity', 'cyber security', 'information security', 'infosec'], resource: 'https://www.cisa.gov/cybersecurity' },
  { key: 'blockchain', name: 'Blockchain', category: 'Specialist', aliases: ['blockchain', 'web3'], resource: 'https://ethereum.org/en/developers/docs/' },
  { key: 'agile', name: 'Agile', category: 'Ways of Working', aliases: ['agile', 'agile methodology'], resource: 'https://www.atlassian.com/agile' },
  { key: 'scrum', name: 'Scrum', category: 'Ways of Working', aliases: ['scrum'], resource: 'https://www.scrum.org/resources/what-scrum-module' },
  { key: 'communication', name: 'Communication', category: 'Professional Skills', aliases: ['communication skills', 'verbal communication', 'written communication'], resource: 'https://www.coursera.org/articles/communication-skills' },
  { key: 'leadership', name: 'Leadership', category: 'Professional Skills', aliases: ['leadership', 'team leadership'], resource: 'https://www.coursera.org/articles/leadership-skills' },
  { key: 'problemsolving', name: 'Problem Solving', category: 'Professional Skills', aliases: ['problem solving', 'problem-solving', 'analytical thinking'], resource: 'https://www.coursera.org/articles/problem-solving-skills' }
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function containsAlias(text, alias) {
  const value = String(text || '');
  // Treat a standalone JS abbreviation as JavaScript, but do not let the '.js' suffix
  // in React.js or Node.js accidentally create an additional JavaScript match.
  if (String(alias).toLowerCase() === 'js') return /(^|[^a-z0-9.])js($|[^a-z0-9])/i.test(value);
  const pattern = escapeRegex(alias);
  return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, 'i').test(value);
}

function extractSkills(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const found = [];
  for (const skill of SKILLS) {
    const sourceLines = [];
    lines.forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return;
      const hasMatch = skill.aliases.some(alias => containsAlias(line, alias));
      if (hasMatch) sourceLines.push({ lineNumber: index + 1, text: line.slice(0, 700) });
    });
    if (sourceLines.length) {
      found.push({
        key: skill.key,
        name: skill.name,
        category: skill.category,
        mentions: sourceLines.length,
        sourceLines,
        resource: skill.resource
      });
    }
  }
  return found;
}

function buildLearningPlan(gaps) {
  if (!gaps.length) return [];
  const modules = gaps.slice(0, 3);
  const phases = [
    (skill) => `Learn the foundations of ${skill.name}. Write down the core concepts, terminology and where it is used in real projects.`,
    (skill) => `Work through the official guide for ${skill.name}. Recreate one beginner example without copying the code line by line.`,
    (skill) => `Complete two focused exercises in ${skill.name}. Record the errors you hit and how you fixed them.`,
    (skill) => `Build a small, working ${skill.name} feature and add a short README explaining your decisions.`
  ];
  const daysPerModule = Math.max(1, Math.floor(12 / modules.length));
  const plan = [];
  for (let day = 1; day <= 12; day += 1) {
    const moduleIndex = Math.min(modules.length - 1, Math.floor((day - 1) / daysPerModule));
    const phaseIndex = (day - 1) % 4;
    const skill = modules[moduleIndex];
    plan.push({
      day,
      focus: skill.name,
      task: phases[phaseIndex](skill),
      resource: skill.resource
    });
  }
  plan.push({
    day: 13,
    focus: 'Integrate your skills',
    task: `Build one small project that uses ${modules.map(item => item.name).join(', ')}. Keep it close to the responsibilities in the job description.`,
    resource: ''
  });
  plan.push({
    day: 14,
    focus: 'Placement readiness',
    task: 'Polish the project README, add measurable resume evidence, and practise explaining the concepts and trade-offs in a mock interview.',
    resource: ''
  });
  return plan;
}

function analyzeResumeGap(resumeText, jobDescription) {
  const resume = extractSkills(resumeText);
  const job = extractSkills(jobDescription);
  const resumeKeys = new Set(resume.map(skill => skill.key));
  const matchedSkills = job.filter(skill => resumeKeys.has(skill.key));
  const missingSkills = job
    .filter(skill => !resumeKeys.has(skill.key))
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  const total = job.length;
  const alignmentPercent = total ? Math.round((matchedSkills.length / total) * 100) : 0;
  const topGaps = missingSkills.slice(0, 3);
  return {
    alignmentPercent,
    totalJobSkills: total,
    matchedCount: matchedSkills.length,
    missingCount: missingSkills.length,
    resumeSkills: resume,
    jobSkills: job,
    matchedSkills,
    missingSkills,
    topGaps,
    learningPlan: buildLearningPlan(topGaps),
    notice: total ? '' : 'No skills from the current skill catalogue were recognised in the job description. Add more specific technical requirements or review the supported skill list.'
  };
}

module.exports = { SKILLS, analyzeResumeGap, extractSkills, buildLearningPlan, containsAlias };
