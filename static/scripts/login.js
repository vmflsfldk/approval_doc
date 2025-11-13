(function () {
    var MIN_PASSWORD_LENGTH = 8;
    var loginState = {
        id: '',
        password: ''
    };

    var passwordChangeModal = null;
    var passwordChangeForm = null;
    var newPasswordInput = null;
    var confirmPasswordInput = null;
    var passwordChangeErrorBox = null;
    var passwordChangeSubmitButton = null;
    var passwordChangeCancelButton = null;

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

    function showPasswordChangeError(message) {
        if (!passwordChangeErrorBox) {
            return;
        }

        passwordChangeErrorBox.textContent = message;
        passwordChangeErrorBox.hidden = false;
    }

    function clearPasswordChangeError() {
        if (!passwordChangeErrorBox) {
            return;
        }

        passwordChangeErrorBox.textContent = '';
        passwordChangeErrorBox.hidden = true;
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

    function setPasswordChangeSubmitting(isSubmitting) {
        if (passwordChangeSubmitButton) {
            if (isSubmitting) {
                passwordChangeSubmitButton.dataset.originalText = passwordChangeSubmitButton.textContent;
                passwordChangeSubmitButton.textContent = '변경 중...';
            } else {
                passwordChangeSubmitButton.textContent = passwordChangeSubmitButton.dataset.originalText || '비밀번호 변경';
            }

            passwordChangeSubmitButton.disabled = isSubmitting;
        }

        if (passwordChangeCancelButton) {
            passwordChangeCancelButton.disabled = isSubmitting;
        }

        if (newPasswordInput) {
            newPasswordInput.disabled = isSubmitting;
        }

        if (confirmPasswordInput) {
            confirmPasswordInput.disabled = isSubmitting;
        }
    }

    function resetPasswordChangeForm() {
        if (passwordChangeForm) {
            passwordChangeForm.reset();
        }

        clearPasswordChangeError();
        setPasswordChangeSubmitting(false);
    }

    function focusNewPasswordInput() {
        if (!newPasswordInput) {
            return;
        }

        window.requestAnimationFrame(function () {
            newPasswordInput.focus();
        });
    }

    function showPasswordChangeModal(userId, password) {
        if (!passwordChangeModal) {
            return;
        }

        loginState.id = userId;
        loginState.password = password;

        resetPasswordChangeForm();
        document.body.classList.add('modal-open');
        passwordChangeModal.hidden = false;
        focusNewPasswordInput();
    }

    function hidePasswordChangeModal() {
        if (passwordChangeModal) {
            passwordChangeModal.hidden = true;
        }

        document.body.classList.remove('modal-open');
        loginState.id = '';
        loginState.password = '';

        var passwordInput = document.getElementById('loginPassword');
        if (passwordInput) {
            passwordInput.focus();
            passwordInput.select();
        }
    }

    function validateNewPassword(newPassword, confirmPassword) {
        if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
            return '새 비밀번호는 최소 ' + MIN_PASSWORD_LENGTH + '자 이상이어야 합니다.';
        }

        if (newPassword !== confirmPassword) {
            return '새 비밀번호가 일치하지 않습니다.';
        }

        if (/\s/.test(newPassword)) {
            return '비밀번호에는 공백을 사용할 수 없습니다.';
        }

        return '';
    }

    function handlePasswordChangeSubmit(event) {
        event.preventDefault();

        if (!loginState.id || !loginState.password) {
            showPasswordChangeError('세션 정보가 만료되었습니다. 다시 로그인해주세요.');
            hidePasswordChangeModal();
            return;
        }

        var newPassword = newPasswordInput ? newPasswordInput.value : '';
        var confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
        var validationMessage = validateNewPassword(newPassword, confirmPassword);

        clearPasswordChangeError();

        if (validationMessage) {
            showPasswordChangeError(validationMessage);
            return;
        }

        setPasswordChangeSubmitting(true);

        fetch('/api/password/change', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                id: loginState.id,
                currentPassword: loginState.password,
                newPassword: newPassword
            })
        })
            .then(function (response) {
                if (!response.ok) {
                    return response.json().catch(function () { return {}; }).then(function (data) {
                        throw new Error(data.error || '비밀번호 변경에 실패했습니다.');
                    });
                }

                return response.json();
            })
            .then(function () {
                hidePasswordChangeModal();
                window.location.href = '/';
            })
            .catch(function (error) {
                console.error(error);
                showPasswordChangeError(error.message);
            })
            .then(function () {
                setPasswordChangeSubmitting(false);
            });
    }

    function handlePasswordChangeCancel() {
        hidePasswordChangeModal();
        clearPasswordChangeError();
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
            .then(function (data) {
                if (data && data.requirePasswordChange) {
                    var userId = typeof data.userId === 'string' && data.userId.trim() ? data.userId.trim() : id;
                    showPasswordChangeModal(userId, password);
                    return;
                }

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

        passwordChangeModal = document.getElementById('passwordChangeModal');
        passwordChangeForm = document.getElementById('passwordChangeForm');
        newPasswordInput = document.getElementById('newPassword');
        confirmPasswordInput = document.getElementById('confirmNewPassword');
        passwordChangeErrorBox = document.getElementById('passwordChangeError');
        passwordChangeSubmitButton = document.getElementById('passwordChangeSubmit');
        passwordChangeCancelButton = document.getElementById('passwordChangeCancel');

        if (passwordChangeForm) {
            passwordChangeForm.addEventListener('submit', handlePasswordChangeSubmit);
        }

        if (passwordChangeCancelButton) {
            passwordChangeCancelButton.addEventListener('click', handlePasswordChangeCancel);
        }

        checkExistingSession();
        form.addEventListener('submit', handleLogin);
    });
})();
