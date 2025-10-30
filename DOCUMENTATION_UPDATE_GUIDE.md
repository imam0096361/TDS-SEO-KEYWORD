# 📝 DOCUMENTATION UPDATE GUIDE

## 🎯 **PURPOSE**

This guide explains **when and how** to update the `PROJECT_MASTER_DOCUMENTATION.md` file.

---

## ⏰ **WHEN TO UPDATE DOCUMENTATION**

Update `PROJECT_MASTER_DOCUMENTATION.md` whenever you:

### **✅ MUST Update (Critical)**
```
1. Add new feature
2. Remove existing feature
3. Change AI provider (add/remove/modify)
4. Update API configuration
5. Change data structures (TypeScript interfaces)
6. Modify prompt engineering
7. Update dependencies
8. Change environment variables
9. Modify deployment process
10. Update cost structure
```

### **✅ SHOULD Update (Important)**
```
11. Fix major bugs
12. Change UI significantly
13. Add new workflow
14. Update performance metrics
15. Add new documentation files
16. Change security practices
17. Update troubleshooting section
```

### **⚠️ CAN Update (Optional)**
```
18. Minor UI tweaks
19. Small bug fixes
20. Code refactoring (no feature change)
21. Comment improvements
```

---

## 📋 **HOW TO UPDATE DOCUMENTATION**

### **Step 1: Open the File**
```bash
# Open in your editor
code PROJECT_MASTER_DOCUMENTATION.md

# Or use any text editor
```

### **Step 2: Find the Relevant Section**

**Common Sections to Update:**
```
CORE FEATURES → Adding/removing features
API KEYS & CONFIGURATION → Changing API setup
DATA STRUCTURES → Modifying TypeScript interfaces
FUTURE ROADMAP → Moving items from planned to implemented
VERSION HISTORY → Adding new version entry
TROUBLESHOOTING → Adding new common issues
```

### **Step 3: Make Your Changes**

**Example: Adding a New AI Provider**
```markdown
BEFORE:
### **2. Perplexity AI (Future - Optional)**
Status: ⏸️ Not Implemented

AFTER:
### **2. Perplexity AI (Implemented)**
Status: ✅ Fully Implemented
Cost: ~$0.005-$0.02 per article
Models:
  - Fast Mode: Sonar
  - Deep Analysis: Sonar Pro
Configuration:
  - Temperature: 0.3
  - Max Tokens: 4096
Setup: UI input → localStorage
```

**Example: Moving Feature from Roadmap to Implemented**
```markdown
In FUTURE ROADMAP section:
REMOVE:
1. ⏸️ Export functionality
   - CSV export
   - JSON export

In CORE FEATURES section:
ADD:
### **8. Export Functionality**
Status: ✅ Implemented
Features:
  - CSV export
  - JSON export
  - Copy to clipboard
```

### **Step 4: Update Version History**
```markdown
Add new version entry at TOP of VERSION HISTORY section:

### **Version 3.1 (Current - November 2024)**
```
Changes:
✅ Added export functionality (CSV/JSON)
✅ Implemented keyword difficulty score
✅ Added bulk processing

Impact: Improved workflow efficiency
Status: Production-ready
```

### **Step 5: Update "Last Updated" Date**
```markdown
At BOTTOM of file, update:

**Last Updated:** November 15, 2024  ← Change this date
**Version:** 3.1                      ← Increment version
**Status:** ✅ Production Ready
```

### **Step 6: Save and Commit**
```bash
git add PROJECT_MASTER_DOCUMENTATION.md
git commit -m "docs: Update master documentation - Added export feature"
git push origin main
```

---

## 🎯 **QUICK UPDATE TEMPLATE**

### **For New Features:**
```markdown
1. Add to CORE FEATURES section:
   ### **X. [Feature Name]**
   ```
   Status: ✅ Fully Implemented
   Description: [What it does]
   Usage: [How to use]
   Configuration: [Settings]
   ```

2. Update FUTURE ROADMAP:
   - Remove from planned list
   - Or mark as ✅ Completed

3. Add to VERSION HISTORY:
   - New version entry
   - List changes
   - Note impact

4. Update "Last Updated" date at bottom
```

### **For Removed Features:**
```markdown
1. In CORE FEATURES section:
   - Delete the feature section
   - Or mark as "Deprecated"

2. In VERSION HISTORY:
   - Add removal note
   - Explain why removed

3. In TROUBLESHOOTING:
   - Remove related issues (if applicable)

4. Update "Last Updated" date
```

### **For Modified Features:**
```markdown
1. In CORE FEATURES:
   - Update the specific section
   - Change Status if needed
   - Update configuration/usage

2. In VERSION HISTORY:
   - Add modification note

3. Update "Last Updated" date
```

---

## 🔍 **VERIFICATION CHECKLIST**

Before committing documentation changes:

```
☐ All new features documented
☐ Removed features deleted or marked deprecated
☐ Version history updated
☐ "Last Updated" date changed
☐ Version number incremented (if major change)
☐ No broken links or references
☐ Markdown formatting correct
☐ Code examples accurate
☐ Screenshots updated (if applicable)
☐ Spell check passed
```

---

## 💡 **BEST PRACTICES**

### **DO:**
```
✅ Update documentation IMMEDIATELY after code changes
✅ Use clear, concise language
✅ Provide examples for complex features
✅ Keep formatting consistent
✅ Update version history with every change
✅ Test code examples before adding
✅ Link to related documentation
✅ Use emojis for visual clarity
```

### **DON'T:**
```
❌ Postpone documentation updates
❌ Use vague descriptions
❌ Add outdated information
❌ Break markdown formatting
❌ Leave TODO items incomplete
❌ Copy-paste without verification
❌ Ignore version control
❌ Skip proofreading
```

---

## 📚 **SECTION-BY-SECTION GUIDE**

### **PROJECT OVERVIEW**
```
Update when: Core purpose changes, key differentiators change
Frequency: Rarely
Example changes:
  - New target audience
  - Different use case
  - Major pivot
```

### **ARCHITECTURE**
```
Update when: Tech stack changes, file structure changes
Frequency: Occasionally
Example changes:
  - New dependency added
  - File reorganization
  - New service file
```

### **CORE FEATURES**
```
Update when: Any feature added/removed/modified
Frequency: Often
Example changes:
  - New AI provider
  - New keyword category
  - Modified workflow
```

### **API KEYS & CONFIGURATION**
```
Update when: API changes, new keys needed
Frequency: Occasionally
Example changes:
  - New API key required
  - Configuration format change
  - Rate limits updated
```

### **DATA STRUCTURES**
```
Update when: TypeScript interfaces change
Frequency: Occasionally
Example changes:
  - New field in Keyword interface
  - New interface added
  - Field type changed
```

### **USER INTERFACE**
```
Update when: UI significantly changes
Frequency: Occasionally
Example changes:
  - New component added
  - Layout redesign
  - New interaction pattern
```

### **WORKFLOWS**
```
Update when: User flows change
Frequency: Occasionally
Example changes:
  - New step added
  - Process simplified
  - Different logic flow
```

### **AI PROMPT ENGINEERING**
```
Update when: Prompts modified
Frequency: Often
Example changes:
  - New instruction added
  - Search volume emphasis changed
  - Output format modified
```

### **DEVELOPMENT**
```
Update when: Setup process changes
Frequency: Rarely
Example changes:
  - New environment variable
  - Different npm command
  - New setup step
```

### **DEPLOYMENT**
```
Update when: Deploy process changes
Frequency: Rarely
Example changes:
  - New hosting platform
  - Different build command
  - New environment config
```

### **PERFORMANCE METRICS**
```
Update when: Performance significantly changes
Frequency: Occasionally
Example changes:
  - Speed improvements
  - Cost changes
  - Traffic potential updates
```

### **TROUBLESHOOTING**
```
Update when: New common issues found
Frequency: Often
Example changes:
  - New error added
  - Solution improved
  - Workaround found
```

### **VERSION HISTORY**
```
Update when: ANY significant change
Frequency: Every update
Example changes:
  - Always add new version entry
  - List all changes
  - Note impact
```

### **FUTURE ROADMAP**
```
Update when: Plans change, features completed
Frequency: Often
Example changes:
  - Move completed to CORE FEATURES
  - Add new planned features
  - Reprioritize items
```

---

## 🚀 **QUICK COMMANDS**

```bash
# Check documentation for broken links (manual)
grep -r "broken" PROJECT_MASTER_DOCUMENTATION.md

# Count total lines
wc -l PROJECT_MASTER_DOCUMENTATION.md

# Search for specific term
grep -n "search term" PROJECT_MASTER_DOCUMENTATION.md

# View last update
tail -n 10 PROJECT_MASTER_DOCUMENTATION.md

# Compare versions (git)
git diff HEAD~1 PROJECT_MASTER_DOCUMENTATION.md
```

---

## 📝 **COMMIT MESSAGE CONVENTIONS**

```
Format: docs: [action] - [description]

Examples:
✅ "docs: Add export feature to master documentation"
✅ "docs: Update AI provider configuration section"
✅ "docs: Remove deprecated Perplexity AI section"
✅ "docs: Fix typo in troubleshooting section"
✅ "docs: Update version history for v3.1"

Bad Examples:
❌ "update docs"
❌ "documentation"
❌ "fixed stuff"
```

---

## 🎯 **SUMMARY**

### **The 3 Golden Rules:**

1. **Update IMMEDIATELY after code changes**
   - Don't postpone
   - Fresh in your mind
   - Prevents forgotten details

2. **Update VERSION HISTORY every time**
   - Track all changes
   - Provides clear timeline
   - Helps debugging

3. **Update "Last Updated" date always**
   - Shows documentation is current
   - Builds trust
   - Easy to verify freshness

---

## 💬 **FOR AI ASSISTANTS**

When you make code changes to this project:

```
STEP 1: Make the code changes
STEP 2: Test the changes
STEP 3: Update PROJECT_MASTER_DOCUMENTATION.md
STEP 4: Commit both code + docs together
STEP 5: Inform user about documentation update

Example:
"I've updated the code to add export functionality.
I've also updated PROJECT_MASTER_DOCUMENTATION.md:
- Added 'Export Functionality' to CORE FEATURES
- Removed it from FUTURE ROADMAP
- Updated VERSION HISTORY to v3.1
- Changed 'Last Updated' date

Would you like me to commit these changes?"
```

---

## ✅ **CHECKLIST FOR DOCUMENTATION UPDATE**

```
Before you commit:

Documentation Content:
☐ All changes documented in relevant sections
☐ Examples provided where needed
☐ Code snippets tested
☐ Links verified
☐ Formatting consistent

Version Control:
☐ VERSION HISTORY updated
☐ Version number incremented (if needed)
☐ "Last Updated" date changed
☐ Impact/status noted

Quality:
☐ Spell checked
☐ Grammar checked
☐ Markdown valid
☐ Clear and concise
☐ Accurate information

Git:
☐ Staged: git add PROJECT_MASTER_DOCUMENTATION.md
☐ Committed with clear message
☐ Pushed to repository
```

---

**🎯 Remember:** Good documentation is as important as good code!

Keep `PROJECT_MASTER_DOCUMENTATION.md` current, and it will be invaluable for:
- New developers joining the project
- AI assistants helping with the code
- Future you understanding past decisions
- Stakeholders understanding the system
- Troubleshooting issues quickly

---

**Last Updated:** October 30, 2024
**For:** PROJECT_MASTER_DOCUMENTATION.md maintenance
**Maintained by:** DS IT Team

