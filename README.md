# 👻 Phantom Hacks
**India's Premium Hackathon Discovery Engine**

Phantom Hacks is a high-performance discovery platform designed for the modern hacker. It aggregates the best hackathons from across India and the globe, providing a seamless, native-app experience for finding your next big challenge.

![Phantom Hacks Preview](assets/logo.png)

## ✨ Key Features
- **🎯 Smart Filtering**: Filter by Level (Beginner, Intermediate, Advanced), Mode (Online, Offline, Hybrid), and Team Size.
- **📅 Dynamic Calendar**: A premium, widget-style calendar to track upcoming deadlines and events.
- **👤 User Profiles**: Personalized profiles to track saved hackathons and registrations.
- **🚀 One-Click Posting**: Simplified submission flow for organisers to reach 50,000+ hackers.
- **💎 Premium UI/UX**: State-of-the-art glassmorphic design system with 32px "bubbled" corners and smooth animations.

## 🛠️ Tech Stack
- **Frontend**: Vanilla HTML5, CSS3 (Custom Design System), JavaScript (ES6+)
- **Database & Auth**: [Supabase](https://supabase.com) (Real-time data & secure OAuth)
- **Background**: Custom Particle System & Canvas Animations
- **Hosting**: [Vercel](https://vercel.com)

## 🚀 Run Locally
1. **Clone the Repo**:
   ```bash
   git clone https://github.com/NagaInbarasan/PhantomHacks.git
   ```
2. **Configuration**:
   - Ensure your Supabase `Anon Key` is correctly set in `js/main.js`.
3. **Launch**:
   - Open in VS Code and use the **Live Server** extension (typically hosts on `http://localhost:5500`).

## 📊 Database Configuration
Phantom Hacks is fully API-driven. Database management is handled via the **Supabase MCP Connector**, allowing for schema updates and data management without complex SQL migrations.

## 🗺️ Roadmap
- [ ] Integration of AI-based team matching.
- [ ] Mobile application (React Native).
- [ ] Advanced prize board analytics.
- [ ] Transition to Next.js for SSR performance.

---
Built with ❤️ for the Indian Hacker Community.