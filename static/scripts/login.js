(function () {
    function showError(message) {
        var errorBox = document.getElementById('loginError');
        if (!errorBox) {
            return;
        }

        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    function clearError() {
        var errorBox = document.getElementById('loginError');
        if (!errorBox) {
            return;
        }

        errorBox.textContent = '';
        errorBox.hidden = true;
    }

    function setSubmitting(isSubmitting) {
        var submitButton = document.getElementById('loginSubmit');
        if (!submitButton) {
            return;
        }

        if (isSubmitting) {
            submitButton.dataset.originalText = submitButton.textContent;
            submitButton.textContent = '로그인 중...';
            submitButton.disabled = true;
        } else {
            submitButton.textContent = submitButton.dataset.originalText || '로그인';
            submitButton.disabled = false;
        }
    }

    function handleLogin(event) {
        event.preventDefault();

        var form = event.target;
        var idInput = form.elements['id'];
        var passwordInput = form.elements['password'];
        var id = idInput ? idInput.value.trim() : '';
        var password = passwordInput ? passwordInput.value : '';

        clearError();

        if (!id || !password) {
            showError('아이디와 비밀번호를 모두 입력해주세요.');
            return;
        }

        setSubmitting(true);

        fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ id: id, password: password })
        })
            .then(function (response) {
                if (!response.ok) {
                    return response.json().catch(function () { return {}; }).then(function (data) {
                        throw new Error(data.error || '로그인에 실패했습니다.');
                    });
                }

                return response.json();
            })
            .then(function () {
                window.location.href = '/';
            })
            .catch(function (error) {
                console.error(error);
                showError(error.message);
            })
            .then(function () {
                setSubmitting(false);
            });
    }

    function checkExistingSession() {
        fetch('/api/session', { credentials: 'include' })
            .then(function (response) {
                if (!response.ok) {
                    return null;
                }

                return response.json();
            })
            .then(function (session) {
                if (session && session.authenticated) {
                    window.location.href = '/';
                }
            })
            .catch(function () {
                // Ignore session check errors on the login screen.
            });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('loginForm');
        if (!form) {
            return;
        }

        checkExistingSession();
        form.addEventListener('submit', handleLogin);
    });
})();
