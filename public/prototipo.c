#include <stdio.h>
#include <stdlib.h>
#include <time.h>

int main()
{

    srand(time(NULL));
    int livello_modificatore = 0;
    int pedina_estratta_B = 0;
    int pedina_estratta_W = 0;
    int mod = 0;
    int continua = 0;


    const char *pedine_W[] = {"pedone", "cavallo", "alfiere", "torre", "regina", "re"};
    const char *pedine_B[] = {"pedone", "cavallo", "alfiere", "torre", "regina", "re"};
    for (int i = 0; i < 4; i++)
    {
        switch (i)
        {
        case 0:
            livello_modificatore = rand() % 50 + 1;
            break;
        case 1:
            livello_modificatore = rand() % 50 + 20;
            break;
        case 2:
            livello_modificatore = rand() % 50 + 30;
            break;
        case 3:
            livello_modificatore = rand() % 50 + 50;
            break;
        
        default:
            break;
        }

        if (livello_modificatore <= 40)
        {
            mod = 1;
        }
        else if (livello_modificatore <= 70 && livello_modificatore > 40)
        {
            mod = 2;
        }
        else if (livello_modificatore <= 90 && livello_modificatore > 70)
        {
            mod = 3;
        }
        else
        {
            mod = 4;
        }



       
        pedina_estratta_B = rand() % 6;
        while(pedine_B[pedina_estratta_B] == NULL)
        {
            
            pedina_estratta_B = rand() % 6;
        }

        printf("nero: %s    %d\n", pedine_B[pedina_estratta_B], mod);

      

        pedina_estratta_W = rand() % 6;
        while(pedine_W[pedina_estratta_W] == NULL)
        {
            
            pedina_estratta_W  = rand() % 6;
        }

        if (livello_modificatore <= 40)
        {
            mod = 1;
        }
        else if (livello_modificatore <= 70 && livello_modificatore > 40)
        {
            mod = 2;
        }
        else if (livello_modificatore <= 90 && livello_modificatore > 70)
        {
            mod = 3;
        }
        else
        {
            mod = 4;
        }

        printf("bianco: %s    %d", pedine_W[pedina_estratta_W], mod);

        pedine_B[pedina_estratta_B] = NULL;
        pedine_W[pedina_estratta_W] = NULL;
        if(i != 3){
            printf("\nper continuare scrivi 1: ");
            scanf("%d", &continua);
            if(continua ==1){
             continue;
            }
            else{
                break;
            }
        }

    }
    return 0;
}

