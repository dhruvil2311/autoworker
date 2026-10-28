import * as fs from 'fs';
import * as path from 'path';

const domains = [
  'shopify', 'amazon', 'woocommerce', 'erp', 
  'warehouse', 'finance', 'crm', 'customer_support'
];

const difficulties = ['Small', 'Medium', 'Large'];

function generateCourseSchema(title: string, domain: string, difficulty: string) {
  return {
    title,
    domain,
    difficulty,
    lessons: [
      { id: "lesson_1", title: "Learn variables", focus: "Variable Extraction", passing_score: 0.95 },
      { id: "lesson_2", title: "Learn business rules", focus: "Business Rules", passing_score: 0.95 },
      { id: "lesson_3", title: "Learn loops", focus: "Iteration", passing_score: 0.95 },
      { id: "lesson_4", title: "Clarification", focus: "Merchant Clarification", passing_score: 0.95 },
      { id: "lesson_5", title: "Execution", focus: "Pipeline Execution", passing_score: 0.95 },
      { id: "lesson_6", title: "Recover from failure", focus: "HITL Recovery", passing_score: 0.95 },
      { id: "lesson_7", title: "Learn after correction", focus: "Knowledge Evolution", passing_score: 0.95 }
    ],
    graduation_criteria: {
      min_average_score: 0.95,
      must_pass_all_lessons: true,
      max_repeat_mistakes: 0
    }
  };
}

const actions = ['Process', 'Update', 'Sync', 'Audit', 'Reconcile', 'Onboard', 'Notify', 'Refund', 'Cancel'];
const entities = ['Orders', 'Invoices', 'Returns', 'Customers', 'Inventory', 'Shipments', 'Tickets', 'Vendors'];

function generateCourseTitle() {
  const action = actions[Math.floor(Math.random() * actions.length)];
  const entity = entities[Math.floor(Math.random() * entities.length)];
  return `${action} ${entity}`;
}

async function main() {
  const baseDir = path.resolve(process.cwd(), 'training');
  
  let courseCount = 0;
  
  for (const domain of domains) {
    const domainPath = path.join(baseDir, domain);
    if (!fs.existsSync(domainPath)) fs.mkdirSync(domainPath, { recursive: true });
    
    // Create 12 or 13 courses per domain to reach 100 total
    const numCourses = domain === 'shopify' || domain === 'amazon' || domain === 'woocommerce' || domain === 'erp' ? 13 : 12;
    
    for (let i = 0; i < numCourses; i++) {
      courseCount++;
      const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
      const title = `${generateCourseTitle()} ${i + 1}`;
      const courseId = title.toLowerCase().replace(/ /g, '_');
      
      const courseDir = path.join(domainPath, courseId);
      fs.mkdirSync(courseDir, { recursive: true });
      fs.mkdirSync(path.join(courseDir, 'recordings'), { recursive: true });
      fs.mkdirSync(path.join(courseDir, 'sop'), { recursive: true });
      fs.mkdirSync(path.join(courseDir, 'csv'), { recursive: true });
      fs.mkdirSync(path.join(courseDir, 'api'), { recursive: true });
      fs.mkdirSync(path.join(courseDir, 'merchant_answers'), { recursive: true });
      
      const schema = generateCourseSchema(title, domain, difficulty);
      fs.writeFileSync(path.join(courseDir, 'course.json'), JSON.stringify(schema, null, 2));
      fs.writeFileSync(path.join(courseDir, 'business_description.md'), `# ${title}\n\nAutomated workflow for ${domain}. Difficulty: ${difficulty}.`);
      fs.writeFileSync(path.join(courseDir, 'expected_bps.json'), '{}');
      fs.writeFileSync(path.join(courseDir, 'expected_plan.json'), '{}');
      fs.writeFileSync(path.join(courseDir, 'expected_execution.json'), '{}');
      fs.writeFileSync(path.join(courseDir, 'expected_learning.json'), '{}');
    }
  }
  
  console.log(`Successfully generated ${courseCount} courses across ${domains.length} domains.`);
}

main().catch(console.error);
