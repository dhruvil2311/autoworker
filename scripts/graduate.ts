import * as fs from 'fs';
import * as path from 'path';
import { UniversityRunner, CourseResult, generateTranscript } from '../packages/university/src/index';

async function main() {
  const baseDir = path.resolve(process.cwd(), 'training');
  const runner = new UniversityRunner(baseDir);
  const results: CourseResult[] = [];

  const domains = fs.readdirSync(baseDir).filter(f => fs.statSync(path.join(baseDir, f)).isDirectory() && !['schema', 'template'].includes(f));

  console.log(`Starting Ghost University Graduation Process...`);
  console.log(`Found domains: ${domains.join(', ')}`);

  for (const domain of domains) {
    const domainPath = path.join(baseDir, domain);
    const courses = fs.readdirSync(domainPath).filter(f => fs.statSync(path.join(domainPath, f)).isDirectory());

    console.log(`\nEntering Domain: ${domain.toUpperCase()} (${courses.length} courses)`);

    for (const courseDir of courses) {
      console.log(`  Running course: ${courseDir}...`);
      
      const fullPath = path.join(domain, courseDir);
      try {
        const result = await runner.evaluateCourse(fullPath);
        results.push(result);
        console.log(`    -> PASSED!`);
      } catch (err: any) {
        console.error(`    -> FAILED: ${err.message}`);
      }
    }
  }

  console.log(`\n==============================================`);
  console.log(`Generating Ghost Transcript...`);
  const transcript = generateTranscript(results);
  
  console.log(JSON.stringify(transcript, null, 2));
  
  fs.writeFileSync('ghost_transcript.json', JSON.stringify(transcript, null, 2));
  console.log(`Transcript written to ghost_transcript.json`);
}

main().catch(console.error);
