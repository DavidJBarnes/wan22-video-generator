/**
 * Queue Page Module
 * Handles job queue display and interactions
 */

const QueuePage = {
    refreshInterval: null,

    init() {
        this.bindEvents();
        this.loadJobs();
        this.startAutoRefresh();
    },

    bindEvents() {
        // Refresh button
        document.getElementById('btn-refresh-queue')?.addEventListener('click', () => {
            this.loadJobs();
        });

        // Toggle queue button
        document.getElementById('btn-toggle-queue')?.addEventListener('click', () => {
            this.toggleQueue();
        });

        // Modal close
        document.querySelector('.modal-close')?.addEventListener('click', () => {
            this.closeModal();
        });

        // Close modal on background click
        document.getElementById('job-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'job-modal') {
                this.closeModal();
            }
        });
    },

    async loadJobs() {
        const tbody = document.getElementById('job-table-body');

        try {
            const jobs = await API.getJobs();

            if (jobs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="loading">No jobs yet. Create one to get started!</td></tr>';
                return;
            }

            tbody.innerHTML = jobs.map(job => this.renderJobRow(job)).join('');

            // Add click handlers
            tbody.querySelectorAll('tr[data-job-id]').forEach(row => {
                row.addEventListener('click', (e) => {
                    // Don't open modal if clicking action buttons
                    if (e.target.closest('.job-actions')) return;
                    this.showJobDetails(row.dataset.jobId);
                });
            });

        } catch (error) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Error loading jobs</td></tr>';
            Toast.error('Failed to load jobs');
        }
    },

    renderJobRow(job) {
        const createdAt = job.created_at ? new Date(job.created_at).toLocaleString() : '-';

        return `
            <tr data-job-id="${job.id}">
                <td>${job.id}</td>
                <td>${this.escapeHtml(job.name)}</td>
                <td><span class="status-pill status-${job.status}">${job.status}</span></td>
                <td>${job.workflow_type || 'txt2img'}</td>
                <td>${createdAt}</td>
                <td class="job-actions">
                    ${this.renderJobActions(job)}
                </td>
            </tr>
        `;
    },

    renderJobActions(job) {
        const actions = [];

        if (job.status === 'pending') {
            actions.push(`<button class="btn btn-small btn-secondary" onclick="QueuePage.cancelJob(${job.id})">Cancel</button>`);
        }

        if (job.status === 'failed' || job.status === 'cancelled') {
            actions.push(`<button class="btn btn-small btn-primary" onclick="QueuePage.retryJob(${job.id})">Retry</button>`);
        }

        if (job.status !== 'running') {
            actions.push(`<button class="btn btn-small btn-danger" onclick="QueuePage.deleteJob(${job.id})">Delete</button>`);
        }

        return actions.join(' ');
    },

    async showJobDetails(jobId) {
        try {
            const job = await API.getJob(jobId);

            document.getElementById('modal-title').textContent = `Job #${job.id}: ${job.name}`;
            document.getElementById('modal-body').innerHTML = this.renderJobDetails(job);
            document.getElementById('modal-footer').innerHTML = this.renderModalActions(job);

            document.getElementById('job-modal').classList.add('active');

        } catch (error) {
            Toast.error('Failed to load job details');
        }
    },

    renderJobDetails(job) {
        const details = [
            { label: 'Status', value: `<span class="status-pill status-${job.status}">${job.status}</span>` },
            { label: 'Workflow Type', value: job.workflow_type || 'txt2img' },
            { label: 'Prompt', value: `<div class="job-detail-value prompt">${this.escapeHtml(job.prompt || '-')}</div>`, raw: true },
            { label: 'Negative Prompt', value: `<div class="job-detail-value prompt">${this.escapeHtml(job.negative_prompt || '-')}</div>`, raw: true },
        ];

        // Add parameters
        if (job.parameters) {
            const params = job.parameters;
            if (params.checkpoint) details.push({ label: 'Checkpoint', value: params.checkpoint });
            if (params.steps) details.push({ label: 'Steps', value: params.steps });
            if (params.cfg) details.push({ label: 'CFG', value: params.cfg });
            if (params.sampler) details.push({ label: 'Sampler', value: params.sampler });
            if (params.width && params.height) details.push({ label: 'Size', value: `${params.width}x${params.height}` });
            if (params.seed) details.push({ label: 'Seed', value: params.seed });
        }

        // Add timestamps
        if (job.created_at) details.push({ label: 'Created', value: new Date(job.created_at).toLocaleString() });
        if (job.started_at) details.push({ label: 'Started', value: new Date(job.started_at).toLocaleString() });
        if (job.completed_at) details.push({ label: 'Completed', value: new Date(job.completed_at).toLocaleString() });

        // Add error message if present
        if (job.error_message) {
            details.push({ label: 'Error', value: `<span style="color: var(--error-color)">${this.escapeHtml(job.error_message)}</span>`, raw: true });
        }

        let html = details.map(d => `
            <div class="job-detail">
                <div class="job-detail-label">${d.label}</div>
                <div class="job-detail-value">${d.raw ? d.value : this.escapeHtml(String(d.value))}</div>
            </div>
        `).join('');

        // Add output images if present
        if (job.output_images && job.output_images.length > 0) {
            html += `
                <div class="job-detail">
                    <div class="job-detail-label">Output Images</div>
                    <div class="output-images">
                        ${job.output_images.map(url => `<img src="${url}" onclick="window.open('${url}', '_blank')" alt="Output">`).join('')}
                    </div>
                </div>
            `;
        }

        return html;
    },

    renderModalActions(job) {
        const actions = [];

        if (job.status === 'pending') {
            actions.push(`<button class="btn btn-secondary" onclick="QueuePage.cancelJob(${job.id}); QueuePage.closeModal();">Cancel Job</button>`);
        }

        if (job.status === 'failed' || job.status === 'cancelled') {
            actions.push(`<button class="btn btn-primary" onclick="QueuePage.retryJob(${job.id}); QueuePage.closeModal();">Retry Job</button>`);
        }

        if (job.status !== 'running') {
            actions.push(`<button class="btn btn-danger" onclick="QueuePage.deleteJob(${job.id}); QueuePage.closeModal();">Delete Job</button>`);
        }

        actions.push(`<button class="btn btn-secondary" onclick="QueuePage.closeModal()">Close</button>`);

        return actions.join('');
    },

    closeModal() {
        document.getElementById('job-modal').classList.remove('active');
    },

    async cancelJob(jobId) {
        try {
            await API.cancelJob(jobId);
            Toast.success('Job cancelled');
            this.loadJobs();
        } catch (error) {
            Toast.error('Failed to cancel job');
        }
    },

    async retryJob(jobId) {
        try {
            await API.retryJob(jobId);
            Toast.success('Job queued for retry');
            this.loadJobs();
        } catch (error) {
            Toast.error('Failed to retry job');
        }
    },

    async deleteJob(jobId) {
        if (!confirm('Are you sure you want to delete this job?')) return;

        try {
            await API.deleteJob(jobId);
            Toast.success('Job deleted');
            this.loadJobs();
        } catch (error) {
            Toast.error('Failed to delete job');
        }
    },

    async toggleQueue() {
        const btn = document.getElementById('btn-toggle-queue');

        try {
            const status = await API.getQueueStatus();

            if (status.is_running) {
                await API.stopQueue();
                Toast.success('Queue stopped');
            } else {
                await API.startQueue();
                Toast.success('Queue started');
            }

            App.updateStatus();

        } catch (error) {
            Toast.error('Failed to toggle queue');
        }
    },

    startAutoRefresh() {
        // Refresh every 5 seconds
        this.refreshInterval = setInterval(() => {
            if (document.getElementById('page-queue').classList.contains('active')) {
                this.loadJobs();
            }
        }, 5000);
    },

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};