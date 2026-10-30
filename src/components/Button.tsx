import type { ButtonHTMLAttributes } from 'react'
import './Button.css'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'text'
}

// 공통 버튼. primary는 초록 채움, text는 글자만 있는 버튼이다.
export default function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`btn btn-${variant} ${className}`} {...rest} />
}
