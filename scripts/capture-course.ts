import { CourseCapturePipeline, RawOperationalData } from '../packages/university/src/capture.js';

async function main() {
  const pipeline = new CourseCapturePipeline();
  
  const mockInputs: RawOperationalData[] = [
    {
      source: 'Chrome Extension',
      payload: { url: 'https://admin.shopify.com', action: 'clicked_refund' }
    },
    {
      source: 'CSV',
      payload: { rowCount: 15, headers: ['Order ID', 'Refund Amount'] }
    }
  ];

  console.log('Capturing real-world workflow from inputs...');
  const candidate = await pipeline.capture(mockInputs);
  
  console.log('\n--- CANDIDATE COURSE PRODUCED ---');
  console.log(JSON.stringify(candidate, null, 2));
  console.log('\nSuccessfully verified Course Capture Pipeline!');
}

main().catch(console.error);
