# PostgreSQL Setup Guide for Seleric Tracker

## Option 1: Local PostgreSQL (Development)

### Install PostgreSQL

**Windows:**
1. Download from https://www.postgresql.org/download/windows/
2. Run installer
3. Set password for `postgres` user
4. Note the port (default: 5432)

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE seleric_tracker;

# Create user (optional, for security)
CREATE USER seleric_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE seleric_tracker TO seleric_user;

# Exit
\q
```

### Configure Environment

Create `.env` file:
```env
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/seleric_tracker?schema=public"
```

Or with custom user:
```env
DATABASE_URL="postgresql://seleric_user:your_secure_password@localhost:5432/seleric_tracker?schema=public"
```

### Run Migrations

```bash
npx prisma generate
npx prisma migrate dev --name init
```

---

## Option 2: Docker PostgreSQL (Easiest for Development)

### Using Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    container_name: seleric_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: seleric_tracker
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Start Database

```bash
docker-compose up -d
```

### Configure Environment

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/seleric_tracker?schema=public"
```

### Run Migrations

```bash
npx prisma generate
npx prisma migrate dev --name init
```

---

## Option 3: Cloud PostgreSQL (Production)

### Railway

1. Go to https://railway.app
2. Create new project
3. Add PostgreSQL service
4. Copy connection string from variables
5. Add to your `.env`:

```env
DATABASE_URL="postgresql://postgres:password@containers-us-west-xx.railway.app:5432/railway?sslmode=require"
```

### Heroku Postgres

1. Install Heroku CLI
2. Create app: `heroku create your-app-name`
3. Add PostgreSQL: `heroku addons:create heroku-postgresql:mini`
4. Get connection string: `heroku config:get DATABASE_URL`

### Supabase

1. Go to https://supabase.com
2. Create new project
3. Go to Settings → Database
4. Copy connection string (Connection Pooling for production)
5. Add to `.env`:

```env
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require"
```

### Neon

1. Go to https://neon.tech
2. Create new project
3. Copy connection string
4. Add to `.env`:

```env
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

---

## Migration from SQLite (if needed)

If you already have SQLite data:

### 1. Export SQLite Data

```bash
# Install pg_dump equivalent for SQLite
npm install -g sqlite3

# Export data (manual process)
sqlite3 dev.sqlite .dump > dump.sql
```

### 2. Convert to PostgreSQL

You'll need to manually adjust the SQL:
- Remove SQLite-specific syntax
- Convert data types
- Adjust AUTO_INCREMENT → SERIAL

### 3. Import to PostgreSQL

```bash
psql -U postgres -d seleric_tracker < converted_dump.sql
```

**Note:** Migration is complex. Easier to start fresh if in development.

---

## Verify Setup

### Check Connection

```bash
npx prisma db push
```

### Open Prisma Studio

```bash
npx prisma studio
```

Should open at http://localhost:5555 and show your database.

### Test Query

```bash
psql -U postgres -d seleric_tracker -c "SELECT * FROM \"Brand\" LIMIT 1;"
```

---

## Troubleshooting

### Connection Refused
- Ensure PostgreSQL is running: `sudo systemctl status postgresql`
- Check port is 5432: `netstat -an | grep 5432`
- Verify firewall allows connections

### Authentication Failed
- Check username and password in connection string
- Verify user has permissions: `GRANT ALL PRIVILEGES ON DATABASE seleric_tracker TO your_user;`

### SSL Error
- Add `?sslmode=require` to connection string for cloud databases
- For local development, use `?sslmode=disable`

### Migration Errors
- Reset database: `npx prisma migrate reset`
- Check Prisma schema syntax
- Ensure PostgreSQL version compatibility (15+ recommended)

---

## Production Best Practices

### Connection Pooling

Use PgBouncer or built-in connection pooling:

```env
# Direct connection (for migrations)
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"

# Pooled connection (for app runtime)
DATABASE_URL="postgresql://user:pass@host:6543/db?schema=public&pgbouncer=true"
```

### Environment Variables

```env
# Always use SSL in production
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public&sslmode=require"

# Set connection limits
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public&sslmode=require&connection_limit=10"
```

### Backup Strategy

```bash
# Automated daily backups
pg_dump -U postgres seleric_tracker > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -U postgres seleric_tracker < backup_20260206.sql
```

### Monitoring

- Use `pg_stat_statements` for query analysis
- Monitor connection count
- Set up alerts for disk usage
- Track slow queries

---

## Performance Optimization

### Indexes

Already included in schema:
- `Session(shop)`
- `EventReceived(shopConfigId, eventType)`
- `EventReceived(shopifyOrderId)`
- `Attribution(customerHash)`

Add more if needed:
```sql
CREATE INDEX idx_events_created_at ON "EventReceived"("createdAt" DESC);
CREATE INDEX idx_health_logs_shop_component ON "HealthLog"("shopifyShop", "component");
```

### Vacuum

```bash
# Regular maintenance
VACUUM ANALYZE;

# Full vacuum (during low traffic)
VACUUM FULL ANALYZE;
```

---

## Next Steps

1. ✅ PostgreSQL installed and running
2. ✅ Database created
3. ✅ `.env` configured with connection string
4. ✅ Migrations run successfully
5. ✅ Prisma Studio accessible
6. 🚀 Ready to develop!

**Your PostgreSQL database is now configured and ready to use!**
