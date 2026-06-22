# TaxTalk — Setup Guide (Plain English)
# Every step explained. No assumptions.

==============================================================
WHERE WE ARE
==============================================================

✅ Code is ready (taxtalk_v4.zip)
✅ Supabase SQL has been run (database tables exist)
✅ Cloudflare bucket created
⬜ Connect the pieces together
⬜ Deploy so it runs in a browser

This guide covers the remaining steps.

==============================================================
STEP 1 — SUPABASE: Get your keys
==============================================================

You already have a Supabase project. Now we need 3 values from it.

1. Go to https://supabase.com and sign in
2. Click your project
3. Click "Project Settings" (gear icon, left sidebar)
4. Click "API" in the left menu
5. You will see:

   Project URL        → looks like: https://abcdefgh.supabase.co
   anon / public key  → a long string starting with "eyJ..."
   service_role key   → another long string starting with "eyJ..."
                        ⚠️ Keep this secret. Never share it.

6. Copy all three and keep them somewhere safe (Notepad is fine for now)

Also do this in Supabase:
- Click "Authentication" in left sidebar
- Click "Providers"
- Make sure "Email" is turned ON (it usually is by default)
- Turn OFF "Confirm email" for now (easier for testing)
  → Under Email provider → uncheck "Confirm email"

==============================================================
STEP 2 — CLOUDFLARE R2: Get your keys
==============================================================

You created the bucket. Now get the API keys to connect to it.

1. Go to https://dash.cloudflare.com and sign in
2. Click "R2 Object Storage" in the left sidebar
3. You will see your bucket (e.g. taxtalk-documents). Good.

Now get the Account ID:
4. Look at the URL in your browser — it will look like:
   https://dash.cloudflare.com/1234567890abcdef/r2/...
   That long number/letters part is your Account ID. Copy it.
   OR click "Overview" and you'll see Account ID on the right side.

Now create an API token for R2:
5. Click "Manage R2 API Tokens" (top right of R2 page)
6. Click "Create API Token"
7. Fill in:
   - Token name: taxtalk-server
   - Permissions: Object Read & Write
   - Specify bucket: select your bucket (taxtalk-documents)
8. Click "Create API Token"
9. You will see THREE values — copy them NOW (they only show once):
   - Access Key ID        → like: abc123...
   - Secret Access Key    → like: xyz789... (longer)
   - Your account ID is also shown here

Keep these saved somewhere safe.

Also — make sure your bucket is PRIVATE:
10. Go back to R2 → click your bucket
11. Click "Settings" tab
12. Under "Public access" — make sure it says "Not allowed" or is OFF
    If it's on, turn it OFF. Documents must never be publicly accessible.

==============================================================
STEP 3 — ANTHROPIC: Get your API key
==============================================================

1. Go to https://console.anthropic.com
2. Sign in (or create a free account)
3. Click "API Keys" in left sidebar
4. Click "Create Key"
5. Name it: taxtalk
6. Copy the key — starts with "sk-ant-..."
7. Save it somewhere safe

Note: You need to add billing to use the API beyond the free limit.
Go to "Billing" and add a card. Costs will be minimal (₹2-6 per return).

==============================================================
STEP 4 — Create your .env file
==============================================================

This file holds all your secret keys. It lives on your computer
and NEVER gets uploaded to the internet.

1. Unzip taxtalk_v4.zip on your computer
2. Open the taxtalk folder
3. You will see a file called ".env.example"
4. Make a COPY of it and name the copy exactly: .env
   (just .env — no other words, the dot is important)
5. Open .env in Notepad (or any text editor)
6. Fill in the values you collected above:

---
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your anon key here...
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your service role key here...

CLOUDFLARE_ACCOUNT_ID=your account id here
R2_ACCESS_KEY_ID=your access key id here
R2_SECRET_ACCESS_KEY=your secret access key here
R2_BUCKET_NAME=taxtalk-documents

ANTHROPIC_API_KEY=sk-ant-your key here

ALLOWED_ORIGIN=http://localhost:5173
---

Replace everything after = with your actual values.
Keep the format exactly the same (no spaces around =).

==============================================================
STEP 5 — Run it on your computer (test first)
==============================================================

Before deploying to the internet, let's make sure it works locally.

You need Node.js installed:
1. Go to https://nodejs.org
2. Download the "LTS" version and install it
3. Restart your computer after installing

Now run TaxTalk:
4. Open the taxtalk folder
5. Hold Shift + right-click inside the folder → "Open PowerShell window here"
   (on Mac: right-click → "New Terminal at Folder")
6. Type this and press Enter:
   npm install
   (wait for it to finish — may take 1-2 minutes)
7. Type this and press Enter:
   npm run dev
8. Open your browser and go to: http://localhost:5173
9. You should see the TaxTalk login screen!

Try creating an account with your email and signing in.

==============================================================
STEP 6 — Make yourself a CA Admin
==============================================================

After you sign up and log in once, do this in Supabase to give
yourself CA access (so you can see the review dashboard):

1. Go to Supabase → your project
2. Click "Table Editor" in left sidebar
3. Click the "profiles" table
4. Find your row (your email should be there)
5. Click on the "role" column for your row
6. Change it from "client" to "ca_admin"
7. Click Save

Now when you log in, you'll see the "CA review" tab.

==============================================================
STEP 7 — Deploy to the internet (Vercel)
==============================================================

Once local testing works, deploy it so clients can access it.

First, put your code on GitHub:
1. Go to https://github.com and create a free account if you don't have one
2. Create a new repository called "taxtalk" (private)
3. Upload your taxtalk folder to it
   (GitHub has a simple drag-and-drop upload option)

Then deploy on Vercel:
4. Go to https://vercel.com and sign in with your GitHub account
5. Click "Add New Project"
6. Select your taxtalk repository
7. Click "Deploy" — Vercel will build it automatically

Now add your secret keys to Vercel:
8. After deploy, go to your project in Vercel
9. Click "Settings" → "Environment Variables"
10. Add EACH line from your .env file as a separate variable:
    - Name: VITE_SUPABASE_URL    Value: https://...
    - Name: VITE_SUPABASE_ANON_KEY  Value: eyJ...
    - (add all of them, one by one)
11. Change ALLOWED_ORIGIN to your Vercel URL:
    e.g. https://taxtalk.vercel.app
12. Click "Redeploy" to apply the new variables

Your app is now live at your Vercel URL!

==============================================================
COMMON ISSUES
==============================================================

"Cannot find module" error when running npm run dev
→ Run "npm install" again in the taxtalk folder

Login says "Invalid API key"
→ Check your .env file — make sure VITE_SUPABASE_ANON_KEY is correct
→ Make sure there are no spaces around the = sign

File upload doesn't work
→ Check R2 keys in .env
→ Make sure bucket name matches exactly (taxtalk-documents)

"Email not confirmed" when logging in
→ Go to Supabase → Authentication → Providers → Email → uncheck "Confirm email"

CA review tab not showing
→ Follow Step 6 to set your role to ca_admin in Supabase

==============================================================
WHAT TO TELL US WHEN STUCK
==============================================================

If something isn't working, tell us:
1. Which step you're on
2. What you see on screen (or paste the error message)
3. What you expected to happen

We'll fix it in the next session.
