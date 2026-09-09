#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<double> v = {1,5,3.5,6.5};

    double sum = 0;

    for(int x = 0; x < v.size(); ++x){
        sum = sum + v[x];
    }
    cout << sum << " " << endl;
}