import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import {
  Alert,
  Button,
  Card,
  ConfigProvider,
  Form,
  Input,
  Space,
  Tabs,
  Typography,
  message,
} from 'antd'
import {
  BankOutlined,
  DesktopOutlined,
  IdcardOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  getApiErrorMessage,
  login,
  markApplyViewerOnNextLogin,
  registerOrganization,
  verifyEmail,
} from '../../services/authService'
import { applyViewerRoleAfterRegistration } from '../../services/registrationAuth'

const ORG_CODE_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/

export default function LoginPage() {
  const navigate = useNavigate()
  const { ready, isAuthenticated, setAuthenticated } = useAuth()
  const [loginForm] = Form.useForm()
  const [registerForm] = Form.useForm()
  const [verifyForm] = Form.useForm()
  const [activeTab, setActiveTab] = useState('login')
  /** After submit register: email + username for verify step and login prefill */
  const [verifyContext, setVerifyContext] = useState(null)
  /** 'form' = org registration fields; 'verify' = 6-digit email code */
  const [registerSubStep, setRegisterSubStep] = useState('form')
  const [loginLoading, setLoginLoading] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [verifyError, setVerifyError] = useState('')

  useEffect(() => {
    if (ready && isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [ready, isAuthenticated, navigate])

  const onLoginFinish = useCallback(
    async (values) => {
      setLoginError('')
      setLoginLoading(true)
      try {
        let data = await login({
          username: values.username.trim(),
          password: values.password,
        })
        if (data?.accessToken) {
          data = await applyViewerRoleAfterRegistration(data)
          setAuthenticated(true)
          navigate('/dashboard', { replace: true })
          return
        }
        setLoginError('Login succeeded but no access token was returned.')
      } catch (e) {
        setLoginError(getApiErrorMessage(e))
      } finally {
        setLoginLoading(false)
      }
    },
    [navigate, setAuthenticated],
  )

  const onRegisterFinish = useCallback(
    async (values) => {
      setRegisterError('')
      setRegisterLoading(true)
      try {
        const data = await registerOrganization({
          organizationName: values.organizationName.trim(),
          organizationCode: values.organizationCode.trim().toLowerCase(),
          adminUsername: values.adminUsername.trim(),
          adminPassword: values.adminPassword,
          adminEmail: values.adminEmail.trim(),
        })
        setVerifyContext({
          email: values.adminEmail.trim(),
          username: values.adminUsername.trim(),
        })
        setRegisterSubStep('verify')
        registerForm.resetFields()
        verifyForm.resetFields()
        setVerifyError('')
        message.info(
          data?.message ||
            'Verification code sent. Complete registration with the code (check email or backend logs if SMTP is off).',
        )
      } catch (e) {
        setRegisterError(getApiErrorMessage(e))
      } finally {
        setRegisterLoading(false)
      }
    },
    [registerForm, verifyForm],
  )

  const onVerifyFinish = useCallback(
    async (values) => {
      if (!verifyContext?.email) {
        setVerifyError('Session expired. Please register again.')
        return
      }
      setVerifyError('')
      setVerifyLoading(true)
      try {
        await verifyEmail({
          email: verifyContext.email,
          code: values.code,
        })
        markApplyViewerOnNextLogin()
        message.success('Email verified. Your account is ready — you can sign in now.')
        verifyForm.resetFields()
        setRegisterSubStep('form')
        loginForm.setFieldsValue({ username: verifyContext.username })
        setVerifyContext(null)
        setActiveTab('login')
      } catch (e) {
        setVerifyError(getApiErrorMessage(e))
      } finally {
        setVerifyLoading(false)
      }
    },
    [verifyContext, verifyForm, loginForm],
  )

  const onTabChange = (key) => {
    setActiveTab(key)
    if (key === 'login') {
      setRegisterError('')
      setVerifyError('')
    } else if (key === 'register') {
      setLoginError('')
      setRegisterError('')
      setVerifyError('')
      registerForm.resetFields()
      verifyForm.resetFields()
      setVerifyContext(null)
      setRegisterSubStep('form')
    }
  }

  const backToRegisterForm = () => {
    setRegisterSubStep('form')
    setVerifyContext(null)
    verifyForm.resetFields()
    setVerifyError('')
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1a5fb4',
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          boxSizing: 'border-box',
          background:
            'linear-gradient(160deg, #eef2f7 0%, #e4eaf3 42%, #dce4f0 100%)',
        }}
      >
        <Card
          variant="borderless"
          style={{
            width: '100%',
            maxWidth: activeTab === 'register' ? 440 : 400,
            boxShadow:
              '0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 40px rgba(15, 23, 42, 0.08)',
            borderRadius: 12,
          }}
          styles={{ body: { padding: '40px 36px 36px' } }}
        >
          <Space
            direction="vertical"
            size="large"
            style={{ width: '100%', textAlign: 'center' }}
          >
            <div>
              <div
                style={{
                  width: 52,
                  height: 52,
                  margin: '0 auto 16px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #1a5fb4 0%, #0d47a1 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 26,
                  boxShadow: '0 4px 14px rgba(26, 95, 180, 0.35)',
                }}
                aria-hidden
              >
                <DesktopOutlined />
              </div>
              <Typography.Title level={3} style={{ margin: 0, color: '#0f172a' }}>
                Digital Signage Platform
              </Typography.Title>
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                {activeTab === 'login'
                  ? 'Admin Login'
                  : registerSubStep === 'verify'
                    ? 'Verify email'
                    : 'Create Account'}
              </Typography.Text>
            </div>

            <Tabs
              activeKey={activeTab}
              onChange={onTabChange}
              centered
              items={[
                { key: 'login', label: 'Login' },
                { key: 'register', label: 'Register' },
              ]}
              style={{ marginTop: -8 }}
            />

            {activeTab === 'login' ? (
              <Form
                form={loginForm}
                layout="vertical"
                requiredMark={false}
                onFinish={onLoginFinish}
                onValuesChange={() => loginError && setLoginError('')}
                style={{ textAlign: 'left' }}
              >
                <Form.Item
                  label="Username"
                  name="username"
                  rules={[{ required: true, message: 'Enter username' }]}
                >
                  <Input
                    size="large"
                    prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Enter username"
                    autoComplete="username"
                  />
                </Form.Item>
                <Form.Item
                  label="Password"
                  name="password"
                  rules={[{ required: true, message: 'Enter password' }]}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                </Form.Item>

                <Form.Item style={{ marginBottom: 12 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    block
                    loading={loginLoading}
                  >
                    Login
                  </Button>
                </Form.Item>
              </Form>
            ) : registerSubStep === 'form' ? (
              <Form
                form={registerForm}
                layout="vertical"
                requiredMark={false}
                onFinish={onRegisterFinish}
                onValuesChange={() => registerError && setRegisterError('')}
                style={{ textAlign: 'left' }}
              >
                <Form.Item
                  label="Organization name"
                  name="organizationName"
                  rules={[
                    { required: true, message: 'Enter organization name' },
                    { max: 255, message: 'Max 255 characters' },
                  ]}
                >
                  <Input
                    size="large"
                    prefix={<BankOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Organization name"
                    autoComplete="organization"
                  />
                </Form.Item>
                <Form.Item
                  label="Organization code"
                  name="organizationCode"
                  normalize={(v) => (typeof v === 'string' ? v.toLowerCase() : v)}
                  extra="Lowercase letters, digits, optional hyphens (2–64 chars)."
                  rules={[
                    { required: true, message: 'Enter organization code' },
                    { min: 2, max: 64, message: 'Length 2–64 characters' },
                    {
                      pattern: ORG_CODE_PATTERN,
                      message:
                        'Use lowercase letters, digits, optional interior hyphens; cannot start/end with hyphen',
                    },
                  ]}
                >
                  <Input
                    size="large"
                    prefix={<IdcardOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="e.g. acme-corp"
                    autoComplete="off"
                  />
                </Form.Item>
                <Form.Item
                  label="Username"
                  name="adminUsername"
                  rules={[
                    { required: true, message: 'Enter admin username' },
                    { min: 2, max: 64, message: 'Length 2–64 characters' },
                  ]}
                >
                  <Input
                    size="large"
                    prefix={<TeamOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Username"
                    autoComplete="username"
                  />
                </Form.Item>
                <Form.Item
                  label="Password"
                  name="adminPassword"
                  rules={[
                    { required: true, message: 'Enter password' },
                    { min: 8, max: 128, message: 'Length 8–128 characters' },
                  ]}
                >
                  <Input.Password
                    size="large"
                    prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="Password"
                    autoComplete="new-password"
                  />
                </Form.Item>
                <Form.Item
                  label="Email"
                  name="adminEmail"
                  rules={[
                    { required: true, message: 'Enter email' },
                    { type: 'email', message: 'Enter a valid email' },
                    { max: 255, message: 'Max 255 characters' },
                  ]}
                >
                  <Input
                    size="large"
                    prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="user@example.com"
                    autoComplete="email"
                  />
                </Form.Item>
                <Form.Item style={{ marginBottom: 12 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    block
                    loading={registerLoading}
                  >
                    Register Account
                  </Button>
                </Form.Item>
              </Form>
            ) : (
              <Space direction="vertical" size="middle" style={{ width: '100%', textAlign: 'left' }}>
                <Alert
                  type="info"
                  showIcon
                  message="Almost done"
                  description={
                    <span>
                      Save your organization only after email verification. A 6-digit code was sent
                      to <strong>{verifyContext?.email}</strong>.
                    </span>
                  }
                />
                <Form
                  form={verifyForm}
                  layout="vertical"
                  requiredMark={false}
                  onFinish={onVerifyFinish}
                  onValuesChange={() => verifyError && setVerifyError('')}
                >
                  <Form.Item
                    label="Verification code"
                    name="code"
                    rules={[
                      { required: true, message: 'Enter the 6-digit code' },
                      {
                        pattern: /^\d{6}$/,
                        message: 'Code must be exactly 6 digits',
                      },
                    ]}
                  >
                    <Input
                      size="large"
                      prefix={<SafetyCertificateOutlined style={{ color: '#94a3b8' }} />}
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block
                        loading={verifyLoading}
                      >
                        Verify email and create account
                      </Button>
                      <Button type="link" onClick={backToRegisterForm} block style={{ marginInline: 0 }}>
                        Back to registration form
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              </Space>
            )}

            <div
              style={{ minHeight: 48, marginTop: -8 }}
              aria-live="polite"
              aria-relevant="additions text"
            >
              {activeTab === 'login' && loginError ? (
                <Alert
                  type="error"
                  showIcon
                  message={loginError}
                  style={{ textAlign: 'left' }}
                />
              ) : null}
              {activeTab === 'register' && registerSubStep === 'form' && registerError ? (
                <Alert
                  type="error"
                  showIcon
                  message={registerError}
                  style={{ textAlign: 'left' }}
                />
              ) : null}
              {activeTab === 'register' && registerSubStep === 'verify' && verifyError ? (
                <Alert
                  type="error"
                  showIcon
                  message={verifyError}
                  style={{ textAlign: 'left' }}
                />
              ) : null}
            </div>
          </Space>
        </Card>
      </div>
    </ConfigProvider>
  )
}
