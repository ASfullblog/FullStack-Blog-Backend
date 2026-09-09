import pool from '../config/database'

export interface AdminGameListItem {
  id: number
  name: string
  slug: string
  shortDesc: string | null
  isPublished: boolean
  viewCount: number
  likeCount: number
  favoriteCount: number
  ratingAvg: number
  ratingCount: number
  sortOrder: number
  publishedAt: string | null
  createdAt: string
}

export interface DashboardStats {
  posts: number
  categories: number
  comments: number
  postViews: number
  gameViews: number
  totalViews: number
}

const getAdminGameList = async (): Promise<AdminGameListItem[]> => {
  const [rows] = await pool.query(
    `SELECT
      id,
      name,
      slug,
      short_desc,
      is_published,
      view_count,
      like_count,
      favorite_count,
      rating_avg,
      rating_count,
      sort_order,
      published_at,
      created_at
     FROM games
     ORDER BY sort_order ASC, id ASC`
  ) as any[]

  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    shortDesc: row.short_desc,
    isPublished: row.is_published === 1,
    viewCount: Number(row.view_count || 0),
    likeCount: Number(row.like_count || 0),
    favoriteCount: Number(row.favorite_count || 0),
    ratingAvg: Number(row.rating_avg || 0),
    ratingCount: Number(row.rating_count || 0),
    sortOrder: Number(row.sort_order || 0),
    publishedAt: row.published_at,
    createdAt: row.created_at
  }))
}

const updateGamePublishStatus = async (id: number, isPublished: boolean) => {
  await pool.query(
    `UPDATE games
     SET is_published = ?, published_at = CASE
       WHEN ? = 1 AND published_at IS NULL THEN NOW()
       WHEN ? = 0 THEN NULL
       ELSE published_at
     END
     WHERE id = ?`,
    [isPublished ? 1 : 0, isPublished ? 1 : 0, isPublished ? 1 : 0, id]
  )

  const [rows] = await pool.query(
    `SELECT
      id,
      name,
      slug,
      short_desc,
      is_published,
      view_count,
      like_count,
      favorite_count,
      rating_avg,
      rating_count,
      sort_order,
      published_at,
      created_at
     FROM games
     WHERE id = ?`,
    [id]
  ) as any[]

  return rows[0]
    ? {
        id: rows[0].id,
        name: rows[0].name,
        slug: rows[0].slug,
        shortDesc: rows[0].short_desc,
        isPublished: rows[0].is_published === 1,
        viewCount: Number(rows[0].view_count || 0),
        likeCount: Number(rows[0].like_count || 0),
        favoriteCount: Number(rows[0].favorite_count || 0),
        ratingAvg: Number(rows[0].rating_avg || 0),
        ratingCount: Number(rows[0].rating_count || 0),
        sortOrder: Number(rows[0].sort_order || 0),
        publishedAt: rows[0].published_at,
        createdAt: rows[0].created_at
      }
    : null
}

const incrementGameViewCount = async (slug: string) => {
  await pool.query('UPDATE games SET view_count = view_count + 1 WHERE slug = ? AND is_published = 1', [slug])
}

const getDashboardStats = async (): Promise<DashboardStats> => {
  const [[postRow], [categoryRow], [commentRow], [postViewRow], [gameViewRow]] = await Promise.all([
    pool.query('SELECT COUNT(*) AS total FROM posts'),
    pool.query('SELECT COUNT(*) AS total FROM categories'),
    pool.query('SELECT COUNT(*) AS total FROM comments'),
    pool.query('SELECT COALESCE(SUM(view_count), 0) AS total FROM posts'),
    pool.query('SELECT COALESCE(SUM(view_count), 0) AS total FROM games')
  ]) as any[]

  const postViews = Number(postViewRow[0]?.total || 0)
  const gameViews = Number(gameViewRow[0]?.total || 0)

  return {
    posts: Number(postRow[0]?.total || 0),
    categories: Number(categoryRow[0]?.total || 0),
    comments: Number(commentRow[0]?.total || 0),
    postViews,
    gameViews,
    totalViews: postViews + gameViews
  }
}

export default {
  getAdminGameList,
  updateGamePublishStatus,
  incrementGameViewCount,
  getDashboardStats
}
