import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from './Modal';

describe('Modal Component', () => {
  it('calls onClose when the close (X) button is clicked even if closeOnBackdropClick is false', () => {
    const handleClose = vi.fn();
    render(
      <Modal
        isOpen={true}
        onClose={handleClose}
        title="نافذة تجريبية"
        closeOnBackdropClick={false}
      >
        <div>محتوى النافذة</div>
      </Modal>
    );

    const closeBtn = screen.getByLabelText('إغلاق النافذة');
    expect(closeBtn).toBeDefined();

    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking backdrop if closeOnBackdropClick is false', () => {
    const handleClose = vi.fn();
    render(
      <Modal
        isOpen={true}
        onClose={handleClose}
        title="نافذة تجريبية"
        closeOnBackdropClick={false}
      >
        <div>محتوى النافذة</div>
      </Modal>
    );

    // The overlay is the first element created in document.body
    const backdrop = document.body.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();

    if (backdrop) {
      fireEvent.click(backdrop);
    }
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('calls onClose when clicking backdrop if closeOnBackdropClick is true', () => {
    const handleClose = vi.fn();
    render(
      <Modal
        isOpen={true}
        onClose={handleClose}
        title="نافذة تجريبية"
        closeOnBackdropClick={true}
      >
        <div>محتوى النافذة</div>
      </Modal>
    );

    const backdrop = document.body.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();

    if (backdrop) {
      fireEvent.click(backdrop);
    }
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
