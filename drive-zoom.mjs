import puppeteer from 'puppeteer-core'
const EXE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const URL = process.argv[2] || 'http://localhost:5174/'
const OUT = process.argv[3] || '/tmp/topo-zoom.png'
const browser = await puppeteer.launch({
  executablePath: EXE, headless: true, protocolTimeout: 60000,
  args: ['--no-sandbox','--disable-dev-shm-usage','--no-first-run','--disable-features=Vulkan,BraveRewards,BraveAds','--enable-unsafe-swiftshader','--window-size=1600,1000'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000 })
  await page.goto(URL, { waitUntil: 'networkidle2' })
  await page.waitForSelector('canvas')
  await new Promise(r=>setTimeout(r,2500))
  await page.mouse.move(900, 500)
  for (let k=0;k<6;k++){ await page.mouse.wheel({ deltaY: -400 }); await new Promise(r=>setTimeout(r,120)) }
  await new Promise(r=>setTimeout(r,500))
  await page.screenshot({ path: OUT })
  console.log('ZOOM OK ->', OUT)
} catch(e){ console.log('ERR', e.message) } finally { await browser.close() }
