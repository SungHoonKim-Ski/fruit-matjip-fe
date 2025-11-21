export interface PaymentData {
    pg: string;
    pay_method: string;
    merchant_uid: string;
    name: string;
    amount: number;
    buyer_email?: string;
    buyer_name?: string;
    buyer_tel?: string;
    buyer_addr?: string;
    buyer_postcode?: string;
}

export interface PaymentResponse {
    success: boolean;
    error_msg?: string;
    imp_uid?: string;
    merchant_uid?: string;
    pay_method?: string;
    paid_amount?: number;
    status?: string;
}

declare global {
    interface Window {
        IMP: any;
    }
}

export const requestPayment = (data: PaymentData): Promise<PaymentResponse> => {
    return new Promise((resolve) => {
        if (!window.IMP) {
            resolve({ success: false, error_msg: '결제 모듈을 불러오지 못했습니다.' });
            return;
        }

        const { IMP } = window;
        // 가맹점 식별코드 (테스트용)
        // 실제 운영 시에는 관리자 페이지에서 발급받은 코드로 교체 필요
        IMP.init('imp48465326');

        IMP.request_pay(data, (rsp: any) => {
            if (rsp.success) {
                resolve({
                    success: true,
                    imp_uid: rsp.imp_uid,
                    merchant_uid: rsp.merchant_uid,
                    pay_method: rsp.pay_method,
                    paid_amount: rsp.paid_amount,
                    status: rsp.status,
                });
            } else {
                resolve({
                    success: false,
                    error_msg: rsp.error_msg,
                });
            }
        });
    });
};
