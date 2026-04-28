const puppeteer = require('puppeteer-core');
const path = require('path');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('Starting browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox'] 
  });
  const page = await browser.newPage();
  // Set a large viewport to ensure diagrams are fully visible and high res
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

  try {
    const htmlPath = 'file:///' + path.resolve(__dirname, 'AquaScan_IEEE_Report.html').replace(/\\/g, '/');
    console.log('Navigating to:', htmlPath);
    await page.goto(htmlPath, { waitUntil: 'networkidle0' });
    
    // Wait for mermaid to initialize and render SVG
    await wait(3000);

    const containers = await page.$$('.mermaid-container');
    
    if (containers.length >= 1) {
      console.log('Capturing Architecture Flowchart...');
      await containers[0].screenshot({ path: path.join(__dirname, 'screenshots', 'architecture_flowchart.png') });
    }
    
    if (containers.length >= 2) {
      console.log('Capturing CV Sequence Diagram...');
      await containers[1].screenshot({ path: path.join(__dirname, 'screenshots', 'cv_sequence_diagram.png') });
    }

  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
    console.log('Done capturing Mermaid diagrams!');
  }
})();
