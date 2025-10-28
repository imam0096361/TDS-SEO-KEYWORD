# 🚀 Setup Instructions - The Daily Star AI Keyword Strategist

## ✅ Status: Server is Running!

The development server is now running in the background on **port 4000**.

---

## ⚠️ IMPORTANT: Add Your Gemini API Key

Before you can use the app, you need to add your Gemini API key:

### Step 1: Create `.env.local` file

In the root directory of this project, create a file named `.env.local` with the following content:

```env
GEMINI_API_KEY=your_actual_api_key_here
```

### Step 2: Get Your API Key

1. Visit: **https://aistudio.google.com/app/apikey**
2. Sign in with your Google account
3. Click "Create API Key" or use an existing one
4. Copy the key (it looks like: `AIzaSy...`)

### Step 3: Add the Key to `.env.local`

Replace `your_actual_api_key_here` with your actual API key:

```env
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Step 4: Save the file and restart

After saving `.env.local`:

1. Stop the current server (Ctrl+C in the terminal)
2. Restart with: `npm run dev`

---

## 🌐 Access the Application

Once your API key is configured:

**Open your browser and navigate to:**

👉 **http://localhost:4000**

---

## 🎯 Quick Test

To verify everything works:

1. Open http://localhost:3000
2. Try pasting this URL in the "Quick Input" field:
   ```
   https://www.thedailystar.net/news
   ```
3. Click "Fetch & Analyze"
4. Or paste any article text (500+ characters) in the Manual Input
5. Click "Generate Keywords"

---

## 🔧 Troubleshooting

### "API_KEY environment variable not set"
- Make sure `.env.local` exists in the root directory
- Verify the file name is exactly `.env.local` (not `.env.local.txt`)
- Check that GEMINI_API_KEY is spelled correctly
- Restart the dev server after creating/editing the file

### "Article content is too short"
- Minimum 500 characters required
- Make sure you're pasting the full article text

### "Request timed out"
- Check your internet connection
- Some URLs may be blocked or slow to respond
- Try pasting the content manually instead

### Port 3000 already in use
- Stop other applications using port 3000
- Or modify the port in `vite.config.ts`

---

## 📁 Project Structure

```
copy-of-the-daily-star_-ai-keyword-strategist/
├── .env.local              ← CREATE THIS FILE (add your API key here)
├── App.tsx                 ← Main application component
├── services/
│   └── geminiService.ts    ← AI integration with validation
├── components/
│   ├── KeywordCard.tsx     ← Keyword display component
│   ├── Loader.tsx          ← Loading animation
│   └── icons.tsx           ← Icon components
├── index.html              ← HTML template
├── index.css               ← Global styles
└── package.json            ← Dependencies

```

---

## 📞 Support

If you encounter any issues:

1. Check the browser console for detailed error messages
2. Check the terminal for server errors
3. Verify your API key is valid and has quota remaining
4. Review `IMPROVEMENTS.md` for the latest changes

---

**Happy Keyword Analyzing! 🎉**

