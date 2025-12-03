# Quick Start Guide

## 1. Add Code to Files

Two files need content added:

### backend/main.py
1. Open `backend/main.py` in your text editor
2. Delete the placeholder comments
3. Paste the **Python backend code** from the artifact
4. Save and close

### frontend/index.html
1. Open `frontend/index.html` in your text editor
2. Delete the placeholder comments
3. Paste the **HTML frontend code** from the artifact
4. Save and close

## 2. Install Dependencies

```bash
./install.sh
```

Or manually:
```bash
cd backend
pip install -r requirements.txt
cd ..
```

## 3. Configure Settings

Edit `backend/config.py`:
- Update `COMFYUI_SERVER_URL` if needed
- Verify model names match your ComfyUI installation

## 4. Run the Application

```bash
./run.sh
```

Or manually:
```bash
# Terminal 1 - Backend
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 - Frontend (optional)
cd frontend
python -m http.server 3000
```

## 5. Open in Browser

- Backend API: http://localhost:8000
- Frontend: Open `frontend/index.html` or http://localhost:3000

## Troubleshooting

**Backend won't start**: Make sure you pasted the code into `backend/main.py`

**Frontend shows errors**: Make sure you pasted the code into `frontend/index.html`

**ComfyUI not connecting**: Check the URL in Settings page

**Import errors**: Run `pip install -r backend/requirements.txt`

For more details, see README.md
