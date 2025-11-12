(function () {
    function redirectToLogin() {
        window.location.href = '/login.html';
    }

    function handleError(message) {
        alert(message || '데이터를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.');
    }

    async function fetchJson(url, options) {
        const response = await fetch(url, Object.assign({
            credentials: 'include'
        }, options));

        if (!response.ok) {
            const error = await response.json().catch(function () { return {}; });
            const message = error && error.error ? error.error : '요청을 처리할 수 없습니다.';
            const requestError = new Error(message);
            requestError.status = response.status;
            throw requestError;
        }

        return response.json();
    }

    document.addEventListener('DOMContentLoaded', function () {
        fetchJson('/api/session')
            .then(function (session) {
                if (!session.authenticated) {
                    redirectToLogin();
                    return Promise.reject(new Error('Unauthenticated'));
                }

                return fetchJson('/api/documents?page=1&perPage=10');
            })
            .then(function (payload) {
                if (typeof Approval === 'undefined') {
                    throw new Error('Approval viewer is not available.');
                }

                Approval.setData(payload.documents, payload.info, payload.pagination);
                Approval.init();
            })
            .catch(function (error) {
                if (error && (error.message === 'Unauthenticated' || error.status === 401)) {
                    redirectToLogin();
                    return;
                }

                console.error(error);
                handleError(error && error.message ? error.message : null);
            });
    });
})();
