FROM node:18-alpine

WORKDIR /app

# 安装系统依赖
RUN apk add --no-cache openssl

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制 Prisma 配置
COPY prisma ./prisma/

# 生成 Prisma 客户端
RUN npx prisma generate

# 复制源代码
COPY . .

# 编译 TypeScript
RUN npm run build

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 3003

# 启动命令
CMD ["npm", "start"]
