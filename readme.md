<p align="center">
  <img src="https://h5-static.aoneroom.com/ssrStatic/mbOfficial/public/_nuxt/web-logo.apJjVir2.svg" alt="LOGO" width="200"/>
</p>

# 🎬 MovieBox API (v4.0.0)

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Status](https://img.shields.io/badge/Status-Live-4c1?style=for-the-badge)](https://moviebox.ph)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **A zero-RAM REST API for MovieBox.** 🚀 Runs on Cloudflare Workers edge network — globally distributed, zero-buffer video streaming, and all metadata endpoints.

---

## ✨ Features

- **🏠 Comprehensive Homepage**: Banners, Trending Now, Hot, Cinema, and custom sections.
- **🔍 Advanced Search**: Real-time keyword suggestions and full-text search.
- **📱 Full Catalog**: Movies, TV Series, Animation, and Rankings with posters, ratings, and metadata.
- **🗃️ Deep Metadata**: IMDb ratings, release dates, high-res posters, genres, cast, seasons, and dub/sub lists.
- **▶️ Zero-Buffer Streaming**: `ReadableStream` pipe-through — video streams without buffering a single byte in memory.
- **🛡️ CDN Bypass**: Cloudflare's native TLS stack is trusted by content delivery networks — no special fingerprinting needed.
- **⚡ Global Edge**: Runs on 300+ Cloudflare edge locations worldwide, ~0ms cold start.

---

## 🛠️ Tech Stack

- **Runtime**: Cloudflare Workers (JavaScript)
- **Networking**: Native `fetch()` API with Cloudflare's TLS stack
- **Deployment**: Wrangler CLI
- **Cost**: Free tier — 100,000 requests/day, ~0 MB RAM per request

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)

### Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mdtahseen7/MovieBox-API.git
   cd MovieBox-API
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the dev server**:
   ```bash
   npm run dev
   ```
   The API will be available at `http://localhost:8787`

### Deploy to Cloudflare

```bash
npx wrangler login     # one-time auth (opens browser)
npx wrangler deploy    # deploys globally to Cloudflare edge
```

After deployment, your API will be live at:
```
https://moviebox-stream-proxy.<your-subdomain>.workers.dev
```

---

## 📡 API Endpoints

### 🏠 Home
| Endpoint | Description |
| :--- | :--- |
| `GET /home` | Full homepage data including banners and all sections |
| `GET /home/sections` | List all available section names and counts |
| `GET /home/banner` | Return featured banner items |
| `GET /home/trending` | Get "Trending Now" section |
| `GET /home/hot` | Get "Hot" section |
| `GET /home/cinema` | Get "Cinema" section |
| `GET /home/section/{name}` | Get a specific section by name |

### 🎬 Movies & TV
| Endpoint | Description |
| :--- | :--- |
| `GET /movies` | Fetch all movies |
| `GET /movies/sections` | List movie sections |
| `GET /movies/section/{name}` | Get a movie section by name |
| `GET /tv-series` | Fetch all TV series |
| `GET /tv-series/sections` | List TV series sections |
| `GET /tv-series/section/{name}` | Get a TV series section by name |
| `GET /animation` | Fetch all animations |
| `GET /animation/sections` | List animation sections |
| `GET /animation/section/{name}` | Get an animation section by name |

### 🏆 Ranking
| Endpoint | Description |
| :--- | :--- |
| `GET /ranking` | Get all ranking lists |
| `GET /ranking/sections` | List ranking sections |
| `GET /ranking/section/{name}` | Get a ranking section by name |

### 🔍 Search & Details
| Endpoint | Description |
| :--- | :--- |
| `GET /search?q={query}` | Search for any title |
| `GET /search/suggest?q={query}` | Get autocomplete suggestions |
| `GET /detail/{slug}` | Full metadata, cast, seasons, and stream links |
| `GET /episodes/{slug}` | Get episode list and counts for all seasons |

### ▶️ Streaming (CDN Bypass)
| Endpoint | Description |
| :--- | :--- |
| `GET /api/stream/{subject_id}?detail_path={slug}` | Get raw stream URLs (JSON) |
| `GET /watch/{subject_id}?detail_path={slug}` | **Stream video directly** — zero-buffer proxy |

**`/watch` Parameters:**
| Param | Required | Description |
| :--- | :--- | :--- |
| `detail_path` | ✅ | The movie/show slug |
| `se` | ❌ | Season number (default: `0`) |
| `ep` | ❌ | Episode number (default: `0`) |
| `resolution` | ❌ | `480`, `720`, `1080`, or `0` for highest (default: `0`) |

**Example:**
```
GET /watch/5203417860348986440?detail_path=boyfriend-on-demand-hindi-OXFhFpXHnc6&se=1&ep=1&resolution=480
```

> **How streaming works:** Your player requests → Cloudflare Worker → CDN. The video body is a `ReadableStream` that pipes straight through the Worker without ever being stored in memory. Seeking works via Range header forwarding.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/mdtahseen7/MovieBox-API/issues).

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<p align="center">
  Made by mdtahseen7 for the Streaming Community
</p>
