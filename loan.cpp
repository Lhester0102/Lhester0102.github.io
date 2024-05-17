#include <iostream>
using namespace std;

int main()
{
double monthlyPayment;
double balance;
double interestRate;
double totalinterestPaid=0;
double Interest_Paid;
int month = 1;
int mtp=0;


cout << "Enter the current balance of your loan in Peso: ";
cin >> balance;
cout << "Enter the interest rate : ";
cin >> interestRate;
cout << "Enter months to pay : ";
cin >> mtp;
monthlyPayment=(balance+(balance* (interestRate/100)))/mtp;


cout<<"\nLoan amount: Peso"<<balance<<"\tAnnual Interest Rate: "<<interestRate<<"%"<<"\tMonthly  Payment: Peso"<<monthlyPayment<<endl;
cout<<"\nMonth# \tMonth-Payment\tInterest-Paid\tDebt-Paid\tLoan-Balance"<<endl;
cout<<"------ \t-------------\t-------------\t----------\t-----------"<<endl;
float rb=balance+(balance* (interestRate/100));
for(int a = 0; a<mtp; a++){
		rb=rb-monthlyPayment;
	cout<<"\n"<<a+1<<"\t"<<mtp<<"\t\t"<<(balance * (interestRate/100))/mtp<<"\t\t";
	cout<<monthlyPayment<<"\t\t";
	if(rb<0){
		cout<<"0.00";
	}
	else{
		cout<<rb;
	}

}

return 0;
}

