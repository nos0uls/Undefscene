/* eslint-disable @typescript-eslint/explicit-function-return-type */
import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

// Пропсы компонента AnimatedField.
type AnimatedFieldProps = {
  // Дочерний элемент (поле ввода)
  children: React.ReactNode
  // Условие видимости: если false - поле скрывается с анимацией
  visible: boolean
  // Уникальный ключ для AnimatePresence (важно для корректной анимации)
  fieldKey: string
}

// Компонент-обёртка для полей инспектора с плавной анимацией появления/исчезновения.
// Использует Framer Motion для плавных переходов opacity и height.
export const AnimatedField = ({ children, visible, fieldKey }: AnimatedFieldProps): React.JSX.Element => {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {visible && (
        <motion.div
          key={fieldKey}
          initial={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
          animate={{
            opacity: 1,
            height: 'auto',
            marginBottom: 4,
            transitionEnd: { overflow: 'visible' }
          }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
