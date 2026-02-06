# Quick Start with PostgreSQL

## 🚀 Fastest Setup (Docker)

```bash
# 1. Start PostgreSQL
docker-compose up -d

# 2. Setup database
npm install
npx prisma generate
npx prisma migrate dev --name init

# 3. Start app
npm run dev
```

**That's it!** PostgreSQL is running and the app is ready.

---

## 📊 Access Database

### Prisma Studio (Visual Database Editor)
```bash
npx prisma studio
```
Opens at http://localhost:5555

### PgAdmin (Full Database Management)
Open http://localhost:5050
- Email: `admin@seleric.local`
- Password: `admin`

Add server:
- Host: `postgres` (or `host.docker.internal` on Windows/Mac)
- Port: `5432`
- Database: `seleric_tracker`
- Username: `postgres`
- Password: `postgres`

### Command Line (psql)
```bash
# Via Docker
docker exec -it seleric_tracker_db psql -U postgres -d seleric_tracker

# Local PostgreSQL
psql -U postgres -d seleric_tracker
```

---

## 🔧 Common Commands

### Check Tables
```bash
npx prisma db push --preview-feature
```

### Reset Database
```bash
npx prisma migrate reset
```

### View Migrations
```bash
npx prisma migrate status
```

### Create Migration
```bash
npx prisma migrate dev --name your_migration_name
```

### Deploy to Production
```bash
npx prisma migrate deploy
```

---

## 🗄️ Sample Queries

### List all brands
```sql
SELECT * FROM "Brand";
```

### Check recent events
```sql
SELECT "eventName", "eventSource", "createdAt" 
FROM "EventReceived" 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

### View shop configurations
```sql
SELECT sc."shopifyShop", b."name" as brand, sc."pixelEnabled", sc."webhookEnabled"
FROM "ShopConfig" sc
JOIN "Brand" b ON sc."brandId" = b.id;
```

### Attribution report
```sql
SELECT "utmSource", "utmCampaign", COUNT(*) as count
FROM "Attribution"
WHERE "capturedAt" >= NOW() - INTERVAL '7 days'
GROUP BY "utmSource", "utmCampaign"
ORDER BY count DESC;
```

---

## 🛑 Stop Database

```bash
docker-compose down
```

To also remove data:
```bash
docker-compose down -v
```

---

## 🔄 Update Database Schema

After changing `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name describe_your_changes
```

---

## 📦 Backup & Restore

### Backup
```bash
docker exec seleric_tracker_db pg_dump -U postgres seleric_tracker > backup.sql
```

### Restore
```bash
docker exec -i seleric_tracker_db psql -U postgres seleric_tracker < backup.sql
```

---

## 🌐 Production Connection

Update `.env` with your production PostgreSQL URL:

```env
# Railway
DATABASE_URL="postgresql://postgres:password@containers-us-west-xx.railway.app:5432/railway?sslmode=require"

# Heroku
DATABASE_URL="postgres://user:pass@ec2-xx-xx-xx-xx.compute-1.amazonaws.com:5432/dbname"

# Supabase
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require"

# Neon
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

Then deploy migrations:
```bash
npx prisma migrate deploy
```

---

## ✅ Health Check

```bash
# Test connection
npx prisma db execute --stdin <<< "SELECT NOW();"

# Check migrations
npx prisma migrate status

# Validate schema
npx prisma validate
```

---

**Database is ready!** Start building with `npm run dev` 🚀
