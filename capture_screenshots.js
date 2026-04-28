const puppeteer = require('puppeteer-core');
const fs = require('fs');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  console.log('Starting browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new', 
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: ['--no-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1536, height: 864 });

  try {
    console.log('1. Landing page');
    await page.goto('http://localhost:5174/');
    await wait(4000);
    await page.screenshot({ path: 'screenshots/1_landing_page.png' });

    console.log('2. Scanner Launch');
    await page.goto('http://localhost:5174/scan');
    await wait(2000);
    await page.screenshot({ path: 'screenshots/2_scanner_launch.png' });

    console.log('3. Uploading trash image');
    const inputUploadHandle = await page.$('#file-input');
    await inputUploadHandle.uploadFile('C:\\Users\\Raj Modi\\Music\\underwater_trash_detector\\trash.png');
    
    console.log('4. Scanning state');
    await wait(200); 
    await page.screenshot({ path: 'screenshots/3_scanning_state.png' });

    console.log('5. Scanned image');
    await page.waitForSelector('#result-annotated', { timeout: 30000 });
    await wait(1000); 
    await page.screenshot({ path: 'screenshots/4_scanned_results.png' });

    console.log('6. Heatmap tab');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const heatmapBtn = btns.find(b => b.textContent.includes('Heatmap'));
      if (heatmapBtn) heatmapBtn.click();
    });
    await wait(1000);
    await page.screenshot({ path: 'screenshots/5_heatmap.png' });

    console.log('7. Compare tab');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const compareBtn = btns.find(b => b.textContent.includes('Compare'));
      if (compareBtn) compareBtn.click();
    });
    await wait(1000);
    await page.screenshot({ path: 'screenshots/6_compare.png' });

    console.log('8. Click on block');
    await page.evaluate(() => { window.scrollBy(0, 500); });
    await wait(500);
    
    const cellBtn = await page.$('button.bg-red-500\\/10');
    if (cellBtn) {
      await cellBtn.click();
      await wait(1000);
      await page.screenshot({ path: 'screenshots/7_cell_details.png' });
    } else {
      console.log('No red cell found!');
    }
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
    console.log('Done!');
  }
})();
