const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// 配置路径
const STATIC_ROOT = '/data//static-files/';
const TMP_DIR = path.join(STATIC_ROOT, 'tmp');
const FILE_DIR = path.join(STATIC_ROOT, 'h5');
// const JENKINS_SCRIPT = '/opt/jenkins-scripts/jenkins-update-h5fix.sh';

// 创建必要目录
if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}
if (!fs.existsSync(FILE_DIR)) {
    fs.mkdirSync(FILE_DIR, { recursive: true });
}

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, TMP_DIR);
    },
    filename: function (req, file, cb) {
        // 如果是h5.zip，直接使用这个名称，否则添加时间戳
        if (file.originalname === 'h5.zip') {
            // 如果已存在h5.zip，先备份
            const existingFile = path.join(TMP_DIR, 'h5.zip');
            if (fs.existsSync(existingFile)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupFile = path.join(TMP_DIR, `h5_backup_${timestamp}.zip`);
                fs.renameSync(existingFile, backupFile);
                console.log(`已备份现有文件到: ${backupFile}`);
            }
            cb(null, 'h5.zip');
        } else {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const ext = path.extname(file.originalname);
            const name = path.basename(file.originalname, ext);
            cb(null, `${name}_${timestamp}${ext}`);
        }
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB限制
    },
    fileFilter: function (req, file, cb) {
        // 只允许zip文件
        if (file.mimetype === 'application/zip' || 
            file.mimetype === 'application/x-zip-compressed' ||
            path.extname(file.originalname).toLowerCase() === '.zip') {
            cb(null, true);
        } else {
            cb(new Error('只允许上传ZIP文件'), false);
        }
    }
});

// 日志函数
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

// 执行shell脚本
function executeJenkinsScript(callback) {
    log('INFO', '开始执行Jenkins热更新脚本');
    
    exec(`chmod +x ${JENKINS_SCRIPT} && ${JENKINS_SCRIPT}`, (error, stdout, stderr) => {
        if (error) {
            log('ERROR', `脚本执行失败: ${error.message}`);
            callback(error, null);
            return;
        }
        
        if (stderr) {
            log('WARNING', `脚本警告: ${stderr}`);
        }
        
        log('SUCCESS', '脚本执行成功');
        log('INFO', `脚本输出: ${stdout}`);
        callback(null, stdout);
    });
}

// 路由

// 首页 - 上传界面
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>热更新文件上传</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #333;
                text-align: center;
                margin-bottom: 30px;
            }
            .upload-area {
                border: 2px dashed #ccc;
                padding: 40px;
                text-align: center;
                margin-bottom: 20px;
                border-radius: 4px;
                background-color: #fafafa;
            }
            .upload-area.dragover {
                border-color: #007cba;
                background-color: #e8f4f8;
            }
            .file-input {
                margin: 20px 0;
            }
            .btn {
                background-color: #007cba;
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            }
            .btn:hover {
                background-color: #005a8b;
            }
            .btn:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
            .progress {
                width: 100%;
                height: 20px;
                background-color: #f0f0f0;
                border-radius: 10px;
                overflow: hidden;
                margin: 20px 0;
                display: none;
            }
            .progress-bar {
                height: 100%;
                background-color: #007cba;
                width: 0%;
                transition: width 0.3s;
            }
            .message {
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
                display: none;
            }
            .message.success {
                background-color: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
            }
            .message.error {
                background-color: #f8d7da;
                border: 1px solid #f5c6cb;
                color: #721c24;
            }
            .status {
                margin-top: 20px;
                padding: 15px;
                background-color: #e9ecef;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔥 热更新文件上传</h1>
            
            <div class="upload-area" id="uploadArea">
                <p>拖拽h5.zip文件到这里，或点击选择文件</p>
                <input type="file" id="fileInput" accept=".zip" style="display: none;">
                <button class="btn" onclick="document.getElementById('fileInput').click()">选择文件</button>
            </div>
            
            <div class="progress" id="progress">
                <div class="progress-bar" id="progressBar"></div>
            </div>
            
            <div class="message" id="message"></div>
            
            <div style="text-align: center;">
                <button class="btn" id="uploadBtn" onclick="uploadFile()" disabled>上传并部署</button>
            </div>
            
            <div class="status">
                <h3>当前状态</h3>
                <p id="statusText">等待文件上传...</p>
                <p><strong>上传目录:</strong> static.ylssd.com/tmp/</p>
                <p><strong>热更新目录:</strong> static.ylssd.com/h5/</p>
            </div>
        </div>
        
        <script>
            let selectedFile = null;
            
            const uploadArea = document.getElementById('uploadArea');
            const fileInput = document.getElementById('fileInput');
            const uploadBtn = document.getElementById('uploadBtn');
            const progress = document.getElementById('progress');
            const progressBar = document.getElementById('progressBar');
            const message = document.getElementById('message');
            const statusText = document.getElementById('statusText');
            
            // 拖拽事件
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });
            
            uploadArea.addEventListener('dragleave', () => {
                uploadArea.classList.remove('dragover');
            });
            
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleFile(files[0]);
                }
            });
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleFile(e.target.files[0]);
                }
            });
            
            function handleFile(file) {
                if (!file.name.endsWith('.zip')) {
                    showMessage('error', '只能上传ZIP文件');
                    return;
                }
                
                selectedFile = file;
                uploadBtn.disabled = false;
                statusText.textContent = \`已选择文件: \${file.name} (大小: \${(file.size / 1024 / 1024).toFixed(2)} MB)\`;
                showMessage('success', '文件已选择，可以开始上传');
            }
            
            function showMessage(type, text) {
                message.className = \`message \${type}\`;
                message.textContent = text;
                message.style.display = 'block';
                
                setTimeout(() => {
                    message.style.display = 'none';
                }, 5000);
            }
            
            function uploadFile() {
                if (!selectedFile) {
                    showMessage('error', '请选择文件');
                    return;
                }
                
                const formData = new FormData();
                formData.append('h5zip', selectedFile);
                
                uploadBtn.disabled = true;
                progress.style.display = 'block';
                statusText.textContent = '正在上传...';
                
                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        progressBar.style.width = percentComplete + '%';
                    }
                });
                
                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        showMessage('success', response.message);
                        statusText.textContent = '上传成功，正在执行热更新...';
                        
                        // 触发热更新
                        triggerHotUpdate();
                    } else {
                        const error = JSON.parse(xhr.responseText);
                        showMessage('error', error.message || '上传失败');
                        statusText.textContent = '上传失败';
                        uploadBtn.disabled = false;
                    }
                    progress.style.display = 'none';
                });
                
                xhr.addEventListener('error', () => {
                    showMessage('error', '网络错误，请重试');
                    statusText.textContent = '上传失败';
                    uploadBtn.disabled = false;
                    progress.style.display = 'none';
                });
                
                xhr.open('POST', '/upload');
                xhr.send(formData);
            }
            
            function triggerHotUpdate() {
                fetch('/trigger-update', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            showMessage('success', '热更新执行成功！');
                            statusText.textContent = '热更新完成';
                        } else {
                            showMessage('error', data.message || '热更新失败');
                            statusText.textContent = '热更新失败';
                        }
                        uploadBtn.disabled = false;
                        selectedFile = null;
                    })
                    .catch(error => {
                        showMessage('error', '热更新失败: ' + error.message);
                        statusText.textContent = '热更新失败';
                        uploadBtn.disabled = false;
                    });
            }
        </script>
    </body>
    </html>
    `);
});

// 文件上传接口
app.post('/upload', upload.single('h5zip'), (req, res) => {
    log('INFO', `收到文件上传请求: ${req.file ? req.file.filename : '无文件'}`);
    
    if (!req.file) {
        log('ERROR', '未收到文件');
        return res.status(400).json({ 
            success: false, 
            message: '未收到文件' 
        });
    }
    
    const filePath = req.file.path;
    const fileSize = req.file.size;
    
    log('INFO', `文件上传成功: ${filePath}, 大小: ${fileSize} bytes`);
    
    res.json({
        success: true,
        message: `文件上传成功: ${req.file.filename}`,
        filename: req.file.filename,
        size: fileSize,
        path: filePath
    });
});

// 触发热更新
app.post('/trigger-update', (req, res) => {
    log('INFO', '收到热更新触发请求');
    
    executeJenkinsScript((error, output) => {
        if (error) {
            log('ERROR', `热更新失败: ${error.message}`);
            res.status(500).json({
                success: false,
                message: '热更新执行失败: ' + error.message
            });
        } else {
            log('SUCCESS', '热更新成功');
            res.json({
                success: true,
                message: '热更新执行成功',
                output: output
            });
        }
    });
});

// 获取版本信息
app.get('/api/version', (req, res) => {
    const versionFile = path.join(FILE_DIR, 'version.json');
    
    if (fs.existsSync(versionFile)) {
        try {
            const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
            res.json(versionData);
        } catch (error) {
            log('ERROR', `读取版本文件失败: ${error.message}`);
            res.status(500).json({ 
                error: '读取版本信息失败' 
            });
        }
    } else {
        res.json({ 
            version: '1.0.0', 
            update_time: new Date().toISOString(),
            file_count: 0,
            status: 'no_update'
        });
    }
});

// 获取热更新文件列表
app.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(FILE_DIR);
        const fileList = files.map(file => {
            const filePath = path.join(FILE_DIR, file);
            const stats = fs.statSync(filePath);
            return {
                name: file,
                size: stats.size,
                mtime: stats.mtime,
                isDirectory: stats.isDirectory()
            };
        });
        
        res.json({
            success: true,
            files: fileList
        });
    } catch (error) {
        log('ERROR', `获取文件列表失败: ${error.message}`);
        res.status(500).json({
            success: false,
            message: '获取文件列表失败'
        });
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        directories: {
            tmp: fs.existsSync(TMP_DIR),
            h5: fs.existsSync(FILE_DIR)
        }
    });
});

// 错误处理中间件
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: '文件大小超出限制 (最大100MB)'
            });
        }
    }
    
    log('ERROR', `服务器错误: ${error.message}`);
    res.status(500).json({
        success: false,
        message: error.message
    });
});

// 启动服务器
app.listen(PORT, () => {
    log('INFO', `热更新服务已启动，端口: ${PORT}`);
    log('INFO', `访问地址: http://localhost:${PORT}`);
    log('INFO', `上传目录: ${TMP_DIR}`);
    log('INFO', `热更新目录: ${FILE_DIR}`);
    log('INFO', `Jenkins脚本: ${JENKINS_SCRIPT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
    log('INFO', '收到SIGTERM信号，正在关闭服务器...');
    process.exit(0);
});

process.on('SIGINT', () => {
    log('INFO', '收到SIGINT信号，正在关闭服务器...');
    process.exit(0);
}); 