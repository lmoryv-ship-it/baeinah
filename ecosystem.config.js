// PM2 — للنشر المباشر على VPS بدون Docker
module.exports = {
    apps: [{
        name:         'baeinah',
        script:       'src/server.js',
        instances:    'max',          // استخدم جميع أنوية المعالج
        exec_mode:    'cluster',
        watch:        false,
        max_memory_restart: '512M',

        env_production: {
            NODE_ENV:   'production',
            PORT:        3000,
        },

        // إعادة تشغيل تلقائية عند الأعطال
        autorestart:  true,
        restart_delay: 3000,
        max_restarts:  10,

        // السجلات
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        out_file:  './logs/out.log',
        error_file:'./logs/error.log',
        merge_logs: true,
    }],

    // نشر مباشر عبر SSH
    deploy: {
        production: {
            user:         'deploy',
            host:         'baeinah.sa',
            ref:          'origin/main',
            repo:         'git@github.com:YOUR_ORG/baeinah.git',
            path:         '/var/www/baeinah',
            'pre-deploy': 'git fetch --all',
            'post-deploy':'npm ci --omit=dev && pm2 reload ecosystem.config.js --env production',
            'pre-deploy-local': 'echo "Deploying to production..."',
        },
    },
};
