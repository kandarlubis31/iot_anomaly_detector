    @echo off
    REM Aktifkan virtual environment
    call .\venv\Scripts\activate.bat

    REM TIDAK ADA BARIS 'set' VARIABEL LINGKUNGAN DI SINI.
    REM Mereka harus diatur sebagai System Environment Variables.

    REM Jalankan aplikasi Flask
    python app.py
    